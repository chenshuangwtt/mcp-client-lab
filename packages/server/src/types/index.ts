/**
 * MCP Client 类型定义
 * 
 * 定义项目中使用的各种接口和类型
 */

/**
 * OpenAI 工具定义接口
 * 用于将 MCP 工具转换为 OpenAI API 可识别的格式
 */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * MCP 工具定义接口
 * 从 MCP 服务器获取的工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

/**
 * 工具调用结果接口
 * 表示工具调用后返回的结果
 */
export interface ToolCallResult {
  content: string;
  [key: string]: unknown;
}
