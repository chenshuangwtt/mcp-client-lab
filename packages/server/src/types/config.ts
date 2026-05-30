/**
 * MCP 服务器配置类型定义
 */

/**
 * Stdio 传输的 MCP 服务器配置
 */
export interface MCPServerConfigStdio {
  transport?: "stdio";   // 传输类型（默认 stdio）
  command: string;       // 启动命令
  args?: string[];       // 命令参数
  env?: Record<string, string>; // 环境变量
  description?: string;  // 服务描述
}

/**
 * SSE 传输的 MCP 服务器配置
 */
export interface MCPServerConfigSSE {
  transport: "sse";      // 传输类型
  url: string;           // SSE 服务器 URL
  description?: string;  // 服务描述
}

/**
 * 单个 MCP 服务器配置（联合类型）
 */
export type MCPServerConfig = MCPServerConfigStdio | MCPServerConfigSSE;

/**
 * MCP 服务器配置映射
 */
export interface MCPServersConfig {
  mcpServers: {
    [key: string]: MCPServerConfig;
  };
  defaultServer?: string; // 默认服务器名称
}
