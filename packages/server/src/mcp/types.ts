/** MCP 工具定义（内部标准格式） */
export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** 统一传输层接口 */
export interface MCPClientInstance {
  readonly name: string;
  readonly transportType: "stdio" | "sse" | "streamable-http";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<MCPToolDef[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
}
