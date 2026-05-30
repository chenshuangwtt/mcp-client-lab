import OpenAI from "openai";
import { getApiKey, getModelName, getBaseURL } from "../config/index.js";
import { NamespacedTool } from "./toolMapper.js";

export class OpenAIClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseURL() || undefined,
    });
    this.model = getModelName();
  }

  get modelName(): string {
    return this.model;
  }

  /** 将 NamespacedTool 转为 OpenAI tool 格式 */
  private toOpenAITools(tools: NamespacedTool[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.displayName,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));
  }

  /**
   * 发送消息给 LLM，返回原始 response
   * 如果传了 tools，会带上工具定义让 LLM 决策
   */
  async sendMessage(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: NamespacedTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.model,
      messages,
    };

    if (tools && tools.length > 0) {
      params.tools = this.toOpenAITools(tools);
      // 让 LLM 自由决定是否调用工具
      params.tool_choice = "auto";
    }

    return this.client.chat.completions.create(params);
  }
}
