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
      data,
    };
    this.trace.steps.push(step);
    return step;
  }

  /** 进入下一轮工具调用 */
  newRound(): void {
    this.currentRound++;
  }

  /** 记录用户消息 */
  recordUserMessage(content: string): void {
    this.addStep("user_message", { content });
    this.persist();
  }

  /** 记录 tools/list 结果 */
  recordToolsList(servers: string[], tools: TraceToolInfo[]): void {
    this.addStep("tools_list", { servers, tools });
    this.persist();
  }

  /** 记录 LLM 请求 */
  recordLLMRequest(model: string, messageCount: number, toolCount: number, hasToolCall: boolean): void {
    this.addStep("llm_request", { model, messageCount, toolCount, hasToolCall });
    this.persist();
  }

  /** 记录 LLM 工具决策 */
  recordToolDecision(invoked: boolean, toolName?: string, args?: Record<string, unknown>, reasoning?: string): void {
    this.addStep("llm_tool_decision", { invoked, toolName, arguments: args, reasoning });
    this.persist();
  }

  /** 记录 MCP 工具调用 */
  recordToolCall(data: TraceToolCall): void {
    this.addStep("mcp_tool_call", { ...data });
    this.persist();
  }

  /** 更新最近一次 mcp_tool_call 步骤（工具执行完成后补全耗时等信息） */
  updateLatestToolCall(patch: { endedAt: string; durationMs: number; serverName: string }): void {
    for (let i = this.trace.steps.length - 1; i >= 0; i--) {
      const step = this.trace.steps[i];
      if (step.type === "mcp_tool_call" && !step.data.endedAt) {
        Object.assign(step.data, patch);
        this.persist();
        return;
      }
    }
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

    this.addStep("mcp_tool_result", { serverName, toolName, result: parsed, truncated });
    this.persist();
  }

  /** 记录最终 LLM 请求 */
  recordFinalLLMRequest(model: string, messageCount: number, toolCount: number): void {
    this.addStep("final_llm_request", { model, messageCount, toolCount, hasToolCall: false });
    this.persist();
  }

  /** 记录最终回答 */
  recordFinalAnswer(content: string): void {
    this.addStep("final_answer", { content });
    this.trace.finalAnswer = content;
    this.persist();
  }

  /** 记录错误 */
  recordError(step: string, message: string, type: string): void {
    this.addStep("error", { step, message, type });
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
