/**
 * MCP客户端实现类
 *
 * 该类负责管理MCP服务器连接、处理工具调用和实现聊天逻辑
 * 基于Model Context Protocol (MCP)，使用OpenAI API实现对话功能
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import readline from "readline/promises";
import OpenAI from "openai";

// 导入服务和工具
import { LLMService } from "./services/LLMService.js";
import { ToolService } from "./services/ToolService.js";
import {
  defaultConfig,
  getApiKey,
  getModelName,
  getBaseURL,
} from "./utils/config.js";
import { OpenAITool } from "./types/index.js";

/**
 * MCP客户端类
 * 负责连接服务器、处理查询和工具调用，是应用程序的核心组件
 */
export class MCPClient {
  private mcp: Client; // MCP客户端
  private transport: StdioClientTransport | SSEClientTransport | null = null; // 传输层
  private tools: OpenAITool[] = []; // 可用工具列表
  private llmService: LLMService; // LLM服务
  private toolService: ToolService; // 工具服务
  private systemPrompt?: string; // 系统提示词，从配置文件中读取
  private messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = []; // 对话消息历史

  /**
   * 构造函数
   * 初始化服务和客户端
   */
  constructor() {
    // 初始化MCP客户端
    this.mcp = new Client({
      name: defaultConfig.clientName,
      version: defaultConfig.clientVersion,
    });

    // 初始化LLM服务
    this.llmService = new LLMService(getApiKey(), getModelName(), getBaseURL());

    // 初始化工具服务
    this.toolService = new ToolService(this.mcp);
  }

  /**
   * 连接到MCP服务器
   * @param serverIdentifier 服务器标识符（脚本路径或配置中的服务器名称）
   * @param configPath 可选，MCP服务器配置文件路径
   */
  /**
   * 从脚本路径获取传输层选项
   * @param scriptPath 脚本路径
   * @returns 传输层选项
   * @private
   */
  private getTransportOptionsForScript(scriptPath: string): {
    command: string;
    args: string[];
    env?: Record<string, string>;
  } {
    // 检查脚本类型
    const isJs = scriptPath.endsWith(".js");
    const isPy = scriptPath.endsWith(".py");

    if (!isJs && !isPy) {
      console.warn("警告: 服务器脚本没有.js或.py扩展名，将尝试使用Node.js运行");
    }

    // 根据脚本类型确定命令
    const command = isPy
      ? process.platform === "win32"
        ? "python"
        : "python3"
      : process.execPath;

    return {
      command,
      args: [scriptPath],
    };
  }

  async connectToServer(
    serverIdentifier: string,
    configPath?: string
  ): Promise<void> {
    try {
      // 创建传输层参数
      let transportOptions: {
        command: string;
        args: string[];
        env?: Record<string, string>;
      } | undefined;

      // 如果提供了配置文件路径，从配置文件加载服务器设置
      if (configPath) {
        try {
          // 使用fs的promise API代替require
          const fs = await import("fs/promises");
          const configContent = await fs.readFile(configPath, "utf8");
          const config = JSON.parse(configContent);

          // 读取系统提示词（如果有）
          this.systemPrompt = config.system;
          this.messages.push({
            role: "system",
            content: this.systemPrompt || "",
          });

          // 检查服务器标识符是否存在于配置中
          if (config.mcpServers && config.mcpServers[serverIdentifier]) {
            const serverConfig = config.mcpServers[serverIdentifier];

            if (serverConfig.transport === "sse") {
              // ===== SSE 传输分支 =====
              this.transport = new SSEClientTransport(serverConfig.url);
              console.log(`使用 SSE 协议连接服务器: ${serverIdentifier}`);
            } else {
              // ===== Stdio 传输分支（原逻辑） =====
              transportOptions = {
                command: serverConfig.command,
                args: serverConfig.args || [],
                env: serverConfig.env,
              };
              console.log(`使用配置文件启动服务器: ${serverIdentifier}`);
            }
          } else if (
            serverIdentifier === "default" &&
            config.defaultServer &&
            config.mcpServers[config.defaultServer]
          ) {
            // 使用默认服务器
            const defaultServerName = config.defaultServer;
            const serverConfig = config.mcpServers[defaultServerName];
            if (serverConfig.transport === "sse") {
              // ===== SSE 传输分支（默认服务器） =====
              this.transport = new SSEClientTransport(serverConfig.url);
              console.log(`使用 SSE 协议连接默认服务器: ${defaultServerName}`);
            } else {
              // ===== Stdio 传输分支（原逻辑） =====
              transportOptions = {
                command: serverConfig.command,
                args: serverConfig.args || [],
                env: serverConfig.env,
              };
              console.log(`使用默认服务器: ${defaultServerName}`);
            }
          } else {
            // 如果指定的服务器不在配置中，打印错误消息
            throw new Error(`在配置文件中未找到服务器 ${serverIdentifier}`);
          }
        } catch (error) {
          console.error(
            `读取配置文件错误: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          // 如果指定了配置文件但未找到查找未指定的服务器，应直接抛出错误
          throw new Error(
            `未能从配置文件 '${configPath}' 中加载服务器 '${serverIdentifier}'`
          );
        }
      } else {
        // 没有提供配置文件，使用传统的脚本路径模式
        transportOptions = this.getTransportOptionsForScript(serverIdentifier);
      }

      // 创建传输层（SSE 分支已设置，仅 stdio 模式需要）
      if (!this.transport && transportOptions) {
        this.transport = new StdioClientTransport(transportOptions);
      }

      // 连接到服务器
      this.mcp.connect(this.transport);

      // 获取可用工具列表
      this.tools = await this.toolService.getTools();
    } catch (error) {
      console.error("连接到MCP服务器失败: ", error);
      throw new Error(
        `连接失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 处理用户查询
   * @param query 用户查询文本
   * @returns 回复文本
   */
  async processQuery(query: string): Promise<string> {
    try {
      // 添加新的用户查询
      this.messages.push({ role: "user", content: query });

      // 获取初始响应
      const response = await this.llmService.sendMessage(
        this.messages,
        this.tools
      );

      // 提取回复内容
      const finalText: string[] = [];

      if (!response.choices || !response.choices[0]) {
        console.log("error", response);
      }

      // 获取响应消息
      const responseMessage = response.choices[0].message;

      // 添加模型回复文本
      if (responseMessage.content) {
        finalText.push(responseMessage.content);

        // 将简单文本回复也添加到对话历史中
        this.messages.push({
          role: "assistant",
          content: responseMessage.content,
        });
      }

      // 处理工具调用
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // 添加工具调用到消息历史
        this.messages.push(responseMessage);

        // 处理每个工具调用
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type === "function") {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

            // 添加工具调用说明
            finalText.push(
              `\n[调用工具 ${toolName}，参数 ${JSON.stringify(
                toolArgs,
                null,
                2
              )}]\n`
            );

            try {
              // 执行工具调用
              const result = await this.toolService.callTool(
                toolName,
                toolArgs
              );

              // 将工具结果添加到消息历史
              // 确保 content 是字符串类型
              const content =
                typeof result.content === "string"
                  ? result.content
                  : JSON.stringify(result.content);

              this.messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: content,
              });
            } catch (toolError) {
              // 工具调用失败，将错误信息添加到消息历史
              this.messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: `错误: ${
                  toolError instanceof Error
                    ? toolError.message
                    : String(toolError)
                }`,
              });

              finalText.push(
                `[工具调用失败: ${
                  toolError instanceof Error
                    ? toolError.message
                    : String(toolError)
                }]`
              );
            }
          }
        }

        // 获取模型对工具结果的解释
        try {
          const followupResponse = await this.llmService.sendMessage(
            this.messages
          );

          const followupContent = followupResponse.choices[0].message.content;

          if (followupContent) {
            finalText.push(followupContent);

            // 将工具调用后的最终回复也添加到对话历史中
            this.messages.push({
              role: "assistant",
              content: followupContent,
            });
          }
        } catch (followupError) {
          finalText.push(
            `[获取后续响应失败: ${
              followupError instanceof Error
                ? followupError.message
                : String(followupError)
            }]`
          );
        }
      }

      return finalText.join("\n");
    } catch (error) {
      console.error("处理查询失败:", error);
      return `处理查询时出错: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  /**
   * 交互式聊天循环
   * 提供命令行交互界面
   */
  async chatLoop(): Promise<void> {
    // 创建命令行交互界面
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // 显示欢迎信息
      console.log("\n===============================");
      console.log("  MCP客户端已启动!");
      console.log("  使用模型: " + this.llmService.getModel());
      console.log("  输入您的问题或输入'quit'退出");
      console.log("===============================\n");

      // 主聊天循环
      while (true) {
        const message = await rl.question("\n问题: ");

        // 检查退出命令
        if (message.toLowerCase() === "quit") {
          console.log("感谢使用MCP客户端，再见！");
          break;
        }

        // 处理空输入
        if (!message.trim()) {
          console.log("请输入有效的问题");
          continue;
        }

        try {
          // 处理查询并显示回复
          console.log("\n正在思考...");
          const response = await this.processQuery(message);
          console.log("\n回答：");
          console.log(response);
        } catch (error) {
          console.error("\n处理查询失败:", error);
        }
      }
    } finally {
      // 关闭命令行界面
      rl.close();
    }
  }

  /**
   * 清理资源
   * 在程序退出前调用，确保资源被正确释放
   */
  async cleanup(): Promise<void> {
    // 清空消息历史
    this.messages = [];
    this.messages.push({
      role: "system",
      content: this.systemPrompt || "",
    });

    if (this.mcp) {
      try {
        await this.mcp.close();
        console.log("已断开与MCP服务器的连接");
      } catch (error) {
        console.error("关闭MCP客户端时出错:", error);
      }
    }
  }
}
