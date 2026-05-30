/**
 * 配置工具模块
 * 负责处理环境变量和配置信息
 */

import dotenv from "dotenv";

// 加载环境变量
dotenv.config();

/**
 * 检查必要的环境变量是否已配置
 * @throws 如果必需的环境变量未设置，则抛出错误
 */
export const validateEnv = (): void => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY 未设置，请在.env文件中配置您的API密钥");
  }
};

/**
 * 获取OpenAI API密钥
 * @returns OpenAI API密钥
 */
export const getApiKey = (): string => {
  return process.env.OPENAI_API_KEY || "";
};

/**
 * 获取配置的LLM模型名称
 * 如果环境变量中未指定，则使用默认值
 * @returns 模型名称
 */
export const getModelName = (): string => {
  return process.env.MODEL_NAME || "gpt-3.5-turbo";
};

export const getBaseURL = (): string => {
  return process.env.BASE_URL || "";
};

/**
 * 默认配置
 */
export const defaultConfig = {
  clientName: "mcp-client-cli",
  clientVersion: "1.0.0",
  defaultModel: getModelName(),
};
