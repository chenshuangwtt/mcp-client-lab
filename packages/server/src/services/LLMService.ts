/**
 * LLM服务模块
 * 负责与OpenAI API的交互
 */

import OpenAI from "openai";
import { OpenAITool } from "../types/index.js";
import { addLogs, logType } from "../utils/log.js";

/**
 * LLM服务类
 * 提供发送消息和处理回复的功能
 */
export class LLMService {
  private openai: OpenAI;
  private model: string;

  /**
   * 构造函数
   * @param apiKey OpenAI API密钥
   * @param model 使用的模型名称，默认为gpt-3.5-turbo
   */
  constructor(
    apiKey: string,
    model: string = "gpt-3.5-turbo",
    baseURL: string = ""
  ) {
    // 初始化OpenAI客户端
    this.openai = new OpenAI({
      baseURL,
      apiKey,
    });
    this.model = model;
  }

  /**
   * 发送消息到OpenAI并获取回复
   * @param messages 消息历史记录
   * @param tools 可用的工具列表
   * @returns 模型回复
   */
  async sendMessage(
    messages: Array<OpenAI.Chat.ChatCompletionMessageParam>,
    tools?: OpenAITool[]
  ) {
    try {
      addLogs("", 
        {
          model: this.model,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        },
        logType.LLMRequest
      );

      // 调用OpenAI API创建聊天回复
      const result = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      });

      // 将请求和响应保存到日志文件

      addLogs("", result, logType.LLMResponse);

      return result;
    } catch (error) {
      addLogs("", error, logType.LLMError);
      throw new Error(
        `发送消息到LLM失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 获取当前使用的模型名称
   * @returns 模型名称
   */
  getModel(): string {
    return this.model;
  }

  /**
   * 设置使用的模型
   * @param model 模型名称
   */
  setModel(model: string): void {
    this.model = model;
  }
}
