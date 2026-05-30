import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { MCPClientManager } from "../mcp/mcpClientManager.js";
import { OpenAIClient } from "../llm/openaiClient.js";
import { TraceRecorder } from "../trace/traceRecorder.js";
import { addLogs, createRequestDir, logType } from "../utils/log.js";
import { logger } from "../utils/logger.js";

// 危险关键词
const DANGEROUS_KEYWORDS = ["delete", "remove", "write", "update", "send", "execute", "shell", "sql"];

function isDangerousTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return DANGEROUS_KEYWORDS.some((kw) => lower.includes(kw));
}

interface ChatRequestBody {
  message?: string;
  serverNames?: string[];
  confirmTool?: {
    traceId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  };
}

type ToolCallRecord = { toolName: string; arguments: Record<string, unknown> };
type NamespacedTools = ReturnType<MCPClientManager["getAllNamespacedTools"]>;

interface ConversationContext {
  traceId: string;
  reqDir: string;
  recorder: TraceRecorder;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  namespacedTools: NamespacedTools;
  allToolCalls: ToolCallRecord[];
}

interface PendingConfirmation extends ConversationContext {
  responseMessage: any;
  round: number;
  toolCallIndex: number;
  createdAt: number;
}

const MAX_TOOL_ROUNDS = 5;
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const pendingConfirmations = new Map<string, PendingConfirmation>();

function cleanupPendingConfirmations(): void {
  const expiredBefore = Date.now() - CONFIRMATION_TTL_MS;
  for (const [traceId, pending] of pendingConfirmations.entries()) {
    if (pending.createdAt < expiredBefore) {
      pending.recorder.recordError("llm_tool_decision", "危险工具确认已过期", "confirmation_expired");
      pending.recorder.finish("error");
      pendingConfirmations.delete(traceId);
    }
  }
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  const parsed = JSON.parse(raw || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

export function createChatRouter(manager: MCPClientManager): Router {
  const router = Router();
  const llm = new OpenAIClient();

  async function executeToolCall(
    context: ConversationContext,
    toolCall: any,
    toolName: string,
    toolArgs: Record<string, unknown>,
    round: number
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    context.recorder.recordToolCall({
      serverName: "",
      toolName,
      arguments: toolArgs,
      startedAt,
      endedAt: "",
      durationMs: 0,
    });

    try {
      addLogs(context.reqDir, { toolName, arguments: toolArgs }, logType.ToolCall, round);

      const { serverName, result } = await manager.callTool(toolName, toolArgs);
      const endedAt = new Date().toISOString();
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

      addLogs(context.reqDir, { serverName, toolName, result, durationMs }, logType.ToolCallResponse, round);

      const toolCallStep = context.recorder.currentTrace.steps.find(
        (s) => s.type === "mcp_tool_call" && !s.data?.endedAt
      );
      if (toolCallStep) {
        toolCallStep.data.endedAt = endedAt;
        toolCallStep.data.durationMs = durationMs;
        toolCallStep.data.serverName = serverName;
      }

      context.recorder.recordToolResult(serverName, toolName, result);
      logger.info("mcp_tool_result", { traceId: context.traceId, serverName, toolName, durationMs });

      const resultContent = typeof result === "string" ? result : JSON.stringify(result);
      context.messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultContent,
      });

      context.allToolCalls.push({ toolName, arguments: toolArgs });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLogs(context.reqDir, { toolName, error: errMsg }, logType.ToolCallError, round);
      logger.error("tool_call_error", { traceId: context.traceId, toolName, error: errMsg });
      context.recorder.recordError("mcp_tool_call", errMsg, "ToolCallError");
      context.recorder.recordToolResult("", toolName, { error: errMsg });
      context.recorder.finish("error");
      pendingConfirmations.delete(context.traceId);
      throw new Error(errMsg);
    }
  }

  async function continueConversation(
    context: ConversationContext,
    initialResponseMessage: any,
    options: {
      round?: number;
      startToolCallIndex?: number;
      confirmedToolCallId?: string;
      responseLogged?: boolean;
      assistantMessageAdded?: boolean;
      roundAlreadyStarted?: boolean;
    } = {}
  ) {
    let responseMessage = initialResponseMessage;
    let startToolCallIndex = options.startToolCallIndex ?? 0;
    let confirmedToolCallId = options.confirmedToolCallId;
    let responseLogged = options.responseLogged ?? false;
    let assistantMessageAdded = options.assistantMessageAdded ?? false;
    let roundAlreadyStarted = options.roundAlreadyStarted ?? false;

    for (let round = options.round ?? 0; round < MAX_TOOL_ROUNDS; round++) {
      if (round > 0 && startToolCallIndex === 0 && !roundAlreadyStarted) context.recorder.newRound();
      roundAlreadyStarted = false;

      if (!responseLogged) {
        addLogs(
          context.reqDir,
          { model: llm.modelName, content: responseMessage.content, toolCalls: responseMessage.tool_calls },
          logType.LLMResponse,
          round
        );
      }
      responseLogged = false;

      const toolCalls = responseMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        const finalContent = responseMessage.content || "";
        addLogs(context.reqDir, { model: llm.modelName, content: finalContent }, logType.LLMResponse);
        context.recorder.recordFinalAnswer(finalContent);
        context.recorder.finish("success");
        pendingConfirmations.delete(context.traceId);
        logger.info("chat_success", { traceId: context.traceId, toolCalls: context.allToolCalls.length });

        return {
          status: "success",
          traceId: context.traceId,
          answer: finalContent,
          toolCalls: context.allToolCalls,
        };
      }

      if (!assistantMessageAdded) {
        context.messages.push(responseMessage);
      }
      assistantMessageAdded = false;

      for (let i = startToolCallIndex; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;

        try {
          toolArgs = parseToolArguments(toolCall.function.arguments);
        } catch (err) {
          const errMsg = `工具参数不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`;
          context.recorder.recordError("llm_tool_decision", errMsg, "InvalidToolArguments");
          context.recorder.finish("error");
          pendingConfirmations.delete(context.traceId);
          return { status: "error", traceId: context.traceId, error: errMsg };
        }

        const isConfirmedTool = confirmedToolCallId === toolCall.id;
        if (!isConfirmedTool) {
          context.recorder.recordToolDecision(true, toolName, toolArgs);
          logger.info("llm_tool_decision", { traceId: context.traceId, toolName, arguments: toolArgs });
        }

        if (isDangerousTool(toolName) && !isConfirmedTool) {
          pendingConfirmations.set(context.traceId, {
            ...context,
            responseMessage,
            round,
            toolCallIndex: i,
            createdAt: Date.now(),
          });
          logger.warn("tool_confirmation_required", { traceId: context.traceId, toolName });
          return {
            status: "need_confirmation",
            traceId: context.traceId,
            toolName,
            arguments: toolArgs,
            message: `工具 "${toolName}" 包含危险操作关键词，请确认是否执行`,
          };
        }

        confirmedToolCallId = undefined;

        try {
          await executeToolCall(context, toolCall, toolName, toolArgs, round);
        } catch (err) {
          return {
            status: "error",
            traceId: context.traceId,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      startToolCallIndex = 0;

      // 工具结果已加入 messages，继续问 LLM
      context.recorder.recordFinalLLMRequest(llm.modelName, context.messages.length, 0);
      const currentResponse = await llm.sendMessage(context.messages, context.namespacedTools);
      responseMessage = currentResponse.choices[0].message;
    }

    const errMsg = `已达到最大工具调用轮次 (${MAX_TOOL_ROUNDS})`;
    context.recorder.recordError("llm_tool_decision", errMsg, "MaxToolRounds");
    context.recorder.finish("error");
    pendingConfirmations.delete(context.traceId);
    return { status: "error", traceId: context.traceId, error: errMsg };
  }

  // POST /api/chat — 发送消息
  router.post("/", async (req, res) => {
    cleanupPendingConfirmations();

    const body = req.body as ChatRequestBody;
    if (!body || (!body.message && !body.confirmTool)) {
      res.status(400).json({ error: "缺少 message 字段" });
      return;
    }

    if (body.confirmTool) {
      const pending = pendingConfirmations.get(body.confirmTool.traceId);
      if (!pending) {
        res.status(409).json({ error: "待确认的工具调用不存在或已过期" });
        return;
      }

      const pendingToolCall = pending.responseMessage.tool_calls?.[pending.toolCallIndex];
      if (!pendingToolCall || pendingToolCall.function.name !== body.confirmTool.toolName) {
        res.status(409).json({ error: "确认信息与待执行工具不匹配" });
        return;
      }

      try {
        const result = await continueConversation(pending, pending.responseMessage, {
          round: pending.round,
          startToolCallIndex: pending.toolCallIndex,
        confirmedToolCallId: pendingToolCall.id,
        responseLogged: true,
        assistantMessageAdded: true,
        roundAlreadyStarted: true,
      });
        res.json(result);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addLogs(pending.reqDir, { error: errMsg }, logType.LLMError);
        logger.error("chat_error", { traceId: pending.traceId, error: errMsg });
        pending.recorder.recordError("chat", errMsg, "ChatError");
        pending.recorder.finish("error");
        pendingConfirmations.delete(pending.traceId);
        res.status(500).json({ status: "error", traceId: pending.traceId, error: errMsg });
      }
      return;
    }

    const traceId = uuidv4();
    const reqDir = createRequestDir(traceId);
    const userMessage = body.message || "";
    const recorder = new TraceRecorder(userMessage, traceId, reqDir);
    logger.info("chat_request", { traceId, message: userMessage.slice(0, 200) });

    try {
      // 1. 记录用户消息
      recorder.recordUserMessage(userMessage);

      // 2. 获取工具列表（按 serverNames 过滤）
      const namespacedTools = manager.getNamespacedToolsByServers(body.serverNames);
      const servers = [...new Set(namespacedTools.map((t) => t.serverName))];
      recorder.recordToolsList(servers, namespacedTools.map((t) => ({
        displayName: t.displayName,
        serverName: t.serverName,
        rawToolName: t.rawToolName,
        description: t.description,
        inputSchema: t.inputSchema,
      })));

      // 3. 构建消息
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "user", content: userMessage },
      ];

      // 4. 发送给 LLM（带工具），循环直到 LLM 不再调用工具
      recorder.recordLLMRequest(llm.modelName, messages.length, namespacedTools.length, false);
      addLogs(reqDir, { model: llm.modelName, messages, tools: namespacedTools.map(t => t.displayName) }, logType.LLMRequest);

      let currentResponse = await llm.sendMessage(messages, namespacedTools);
      let responseMessage = currentResponse.choices[0].message;
      const result = await continueConversation({
        traceId,
        reqDir,
        recorder,
        messages,
        namespacedTools,
        allToolCalls: [],
      }, responseMessage);

      res.json(result);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addLogs(reqDir, { error: errMsg }, logType.LLMError);
      logger.error("chat_error", { traceId, error: errMsg });
      recorder.recordError("chat", errMsg, "ChatError");
      recorder.finish("error");

      res.status(500).json({
        status: "error",
        traceId,
        error: errMsg,
      });
    }
  });

  // POST /api/chat/cancel-confirmation — 取消危险工具确认
  router.post("/cancel-confirmation", async (req, res) => {
    const { traceId } = req.body as { traceId?: string };
    if (!traceId) {
      res.status(400).json({ error: "缺少 traceId" });
      return;
    }

    const pending = pendingConfirmations.get(traceId);
    if (!pending) {
      res.status(404).json({ error: "待确认的工具调用不存在或已过期" });
      return;
    }

    pending.recorder.recordError("llm_tool_decision", "用户取消危险工具调用", "UserCancelled");
    pending.recorder.finish("error");
    pendingConfirmations.delete(traceId);
    logger.info("confirmation_cancelled", { traceId });

    res.json({ success: true, traceId });
  });

  return router;
}
