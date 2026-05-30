import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// 从当前文件路径向上找项目根目录的 .env 并加载
const __dirname = path.dirname(fileURLToPath(import.meta.url));
(function loadEnv(): void {
  // 尝试多个可能路径
  const candidates = [
    path.resolve(__dirname, "../../../../.env"),      // 从 packages/server/src/config/ → 项目根目录
    path.resolve(__dirname, "../../../.env"),          // 从 packages/server/src/
    path.resolve(__dirname, "../../.env"),             // 从 packages/server/
    path.resolve(process.cwd(), "../../.env"),         // 从 cwd 向上
    path.resolve(process.cwd(), "../.env"),            // 从 cwd 向上
    path.resolve(process.cwd(), ".env"),               // 从 cwd
  ];
  for (const envPath of candidates) {
    try {
      const content = fsSync.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      break; // 成功读取后退出
    } catch {
      continue; // 尝试下一个路径
    }
  }
})();

// ===== Env config =====

export function validateEnv(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY 未设置，请在 .env 文件中配置");
  }
}

export function getApiKey(): string {
  return process.env.OPENAI_API_KEY || "";
}

export function getModelName(): string {
  return process.env.MODEL_NAME || "gpt-4o-mini";
}

export function getBaseURL(): string {
  return process.env.BASE_URL || "";
}

export function getPort(): number {
  return parseInt(process.env.PORT || "3001", 10);
}

export const defaultConfig = {
  clientName: "mcp-client-lab",
  clientVersion: "0.1.0",
};

// ===== MCP Server config loading =====

export interface StdioServerRawConfig {
  transport?: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  description?: string;
}

export interface SSEServerRawConfig {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
  description?: string;
}

export interface StreamableHttpServerRawConfig {
  transport: "streamable-http";
  url: string;
  headers?: Record<string, string>;
  description?: string;
}

export type MCPServerRawConfig = StdioServerRawConfig | SSEServerRawConfig | StreamableHttpServerRawConfig;

export interface MCPServersRawConfig {
  mcpServers: Record<string, MCPServerRawConfig>;
  defaultServer?: string;
  system?: string;
}

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../../../../mcp-servers.json");

export async function loadServersConfig(configPath?: string): Promise<MCPServersRawConfig> {
  const targetPath = configPath || DEFAULT_CONFIG_PATH;
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as MCPServersRawConfig;
  } catch (err) {
    throw new Error(
      `无法读取配置文件 ${targetPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
