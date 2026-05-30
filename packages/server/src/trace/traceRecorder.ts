import {
  Trace,
  TraceStep,
  TraceStepType,
  TraceStatus,
  TraceToolInfo,
  TraceToolCall,
  TraceToolResult,
} from "./traceTypes.js";
import { saveTrace } from "./traceStore.js";

const MAX_RESULT_LENGTH = 5000;

export class TraceRecorder {
  private trace: Trace;
  private stepIndex = 0;
  private currentRound = 0;
  private dir: string;

  constructor(userMessage: string, traceId: string, dir: string) {
    this.dir = dir;
    this.trace = {
      traceId,
      userMessage,
      startedAt: new Date().toISOString(),
      status: "running",
      steps: [],
    };
  }

  get traceId(): string {
    return this.trace.traceId;
  }

  get currentTrace(): Trace {
    return { ...this.trace };
  }

  private addStep(type: TraceStepType, data: Record<string, unknown>): TraceStep {
    const step: TraceStep = {
      id: `${type}-${this.stepIndex++}`,
      type,
      timestamp: new Date().toISOString(),
      round: this.currentRound,
      ...data,
    } as TraceStep;
    this.trace.steps.push(step);
    return step;
  }

  /** 进入下一轮工具调用 */
  newRound(): void {
    this.currentRound++;
  }

  /** 记录用户消息 */
  recordUserMessage(content: string): void {
    this.addStep("user_message", { content } as Record<string, unknown>);
    this.persist();
  }

  /** 记录 tools/list 结果 */
  recordToolsList(servers: string[], tools: TraceToolInfo[]): void {
    this.addStep("tools_list", { servers, tools } as Record<string, unknown>);
    this.persist();
  }

  /** 记录 LLM 请求 */
  recordLLMRequest(model: string, messageCount: number, toolCount: number, hasToolCall: boolean): void {
    this.addStep("llm_request", {
      data: { model, messageCount, toolCount, hasToolCall },
    } as Record<string, unknown>);
    this.persist();
  }

  /** 记录 LLM 工具决策 */
  recordToolDecision(invoked: boolean, toolName?: string, args?: Record<string, unknown>, reasoning?: string): void {
    this.addStep("llm_tool_decision", {
      data: { invoked, toolName, arguments: args, reasoning },
    } as Record<string, unknown>);
    this.persist();
  }

  /** 记录 MCP 工具调用 */
  recordToolCall(data: TraceToolCall): void {
    this.addStep("mcp_tool_call", { data } as Record<string, unknown>);
    this.persist();
  }

  /** 记录 MCP 工具结果 */
  recordToolResult(serverName: string, toolName: string, result: unknown): void {
    let truncated = false;
    let resultStr = typeof result === "string" ? result : JSON.stringify(result);

    if (resultStr.length > MAX_RESULT_LENGTH) {
      resultStr = resultStr.slice(0, MAX_RESULT_LENGTH) + "\n... [已截断]";
      truncated = true;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resultStr);
    } catch {
      parsed = resultStr;
    }

    const data: TraceToolResult = {
      serverName,
      toolName,
      result: parsed,
      truncated,
    };

    this.addStep("mcp_tool_result", { data } as Record<string, unknown>);
    this.persist();
  }

  /** 记录最终 LLM 请求 */
  recordFinalLLMRequest(model: string, messageCount: number, toolCount: number): void {
    this.addStep("final_llm_request", {
      data: { model, messageCount, toolCount, hasToolCall: false },
    } as Record<string, unknown>);
    this.persist();
  }

  /** 记录最终回答 */
  recordFinalAnswer(content: string): void {
    this.addStep("final_answer", { content } as Record<string, unknown>);
    this.trace.finalAnswer = content;
    this.persist();
  }

  /** 记录错误 */
  recordError(step: string, message: string, type: string): void {
    this.addStep("error", {
      data: { step, message, type },
    } as Record<string, unknown>);
    this.persist();
  }

  /** 结束 Trace */
  finish(status: "success" | "error"): void {
    this.trace.status = status;
    this.trace.endedAt = new Date().toISOString();
    this.persist();
  }

  private persist(): void {
    saveTrace(this.trace, this.dir).catch(() => {});
  }
}
