/**
 * 工具服务模块
 * 负责处理与MCP工具相关的逻辑
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { MCPTool, OpenAITool, ToolCallResult } from "../types/index.js";
import { patchSchemaArrays } from "../utils/schema.js";
import { addLogs, logType } from "../utils/log.js";

/**
 * 工具服务类
 * 提供工具列表获取和工具调用功能
 */
export class ToolService {
  private client: Client;

  /**
   * 构造函数
   * @param client MCP客户端实例
   */
  constructor(client: Client) {
    this.client = client;
  }

  /**
   * 获取服务器提供的工具列表
   * @returns 转换后的OpenAI工具格式数组
   */
  async getTools(): Promise<OpenAITool[]> {
    try {
      // 从MCP服务器获取工具列表
      const toolsResult = await this.client.listTools();

      const logInfo = toolsResult.tools.map((tool) => {
        return { name: tool.name, description: tool.description };
      });

      addLogs("", logInfo, logType.GetTools);

      // 将MCP工具转换为OpenAI工具格式
      return toolsResult.tools.map((tool: MCPTool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: patchSchemaArrays(tool.inputSchema) || {},
        },
      }));
    } catch (error) {
      addLogs("", error, logType.GetToolsError);
      throw new Error(
        `获取工具列表失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 调用MCP工具
   * @param toolName 工具名称
   * @param toolArgs 工具参数
   * @returns 工具调用结果
   */
  async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<ToolCallResult> {
    try {
      addLogs("", 
        {
          name: toolName,
          arguments: toolArgs,
        },
        logType.ToolCall
      );
      // 执行工具调用
      const result = await this.client.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      addLogs("", result, logType.ToolCallResponse);
      return result;
    } catch (error) {
      addLogs("", error, logType.ToolCallError);

      throw new Error(
        `调用工具 ${toolName} 失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
