// ===== Trace 数据模型 =====

/** Trace 步骤类型枚举 */
export type TraceStepType =
  | "user_message"
  | "tools_list"
  | "llm_request"
  | "llm_tool_decision"
  | "mcp_tool_call"
  | "mcp_tool_result"
  | "final_llm_request"
  | "final_answer"
  | "error";

/** Trace 状态 */
export type TraceStatus = "running" | "success" | "error";

/** 工具信息 (tools_list 步骤使用) */
export interface TraceToolInfo {
  displayName: string;
  serverName: string;
  rawToolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** LLM 请求摘要 (隐藏敏感信息) */
export interface TraceLLMRequest {
  model: string;
  messageCount: number;
  toolCount: number;
  hasToolCall: boolean;
}

/** LLM 工具决策 */
export interface TraceToolDecision {
  invoked: boolean;
  toolName?: string;
  arguments?: Record<string, unknown>;
  reasoning?: string;
}

/** MCP 工具调用记录 */
export interface TraceToolCall {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

/** MCP 工具结果 */
export interface TraceToolResult {
  serverName: string;
  toolName: string;
  result: unknown;
  truncated: boolean;
  error?: string;
}

/** 错误信息 */
export interface TraceError {
  step: string;
  message: string;
  type: string;
}

/** Trace 步骤（统一结构，业务字段全部在 data 中） */
export interface TraceStep {
  id: string;
  type: TraceStepType;
  timestamp: string;
  round: number;
  data: Record<string, unknown>;
}

/** 完整 Trace 记录 */
export interface Trace {
  traceId: string;
  userMessage: string;
  finalAnswer?: string;
  startedAt: string;
  endedAt?: string;
  status: TraceStatus;
  steps: TraceStep[];
}
