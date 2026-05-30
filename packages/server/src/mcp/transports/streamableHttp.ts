import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { MCPClientInstance, MCPToolDef } from "../types.js";

export interface StreamableHttpConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * 基于 fetch 的 Streamable HTTP Transport 实现（教学版最小实现）
 *
 * MCP Streamable HTTP 规范：
 * - POST /mcp 发送 JSON-RPC 请求，接收 JSON-RPC 响应
 * - GET /sse 可选的 SSE 流（用于服务器推送通知）
 *
 * ⚠️ 当前为教学版最小实现，适合 Demo 和学习。
 * 不保证覆盖完整 MCP Streamable HTTP 协议（如 resumability、event store 等）。
 * 生产环境建议使用 MCP SDK 官方 Transport。
 */
class StreamableHTTPTransport implements Transport {
  private url: string;
  private headers: Record<string, string>;
  private _sessionId: string | null = null;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string, headers: Record<string, string> = {}) {
    this.url = url;
    this.headers = headers;
  }

  async start(): Promise<void> {
    // Streamable HTTP 不需要预连接，首次请求会自动建立会话
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...this.headers,
    };
    if (this._sessionId) {
      headers["Mcp-Session-Id"] = this._sessionId;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 保存 session ID（如果服务器返回）
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this._sessionId = sessionId;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (this.onmessage) {
        this.onmessage(data as JSONRPCMessage);
      }
    } else if (contentType.includes("text/event-stream")) {
      // SSE 流 — 逐行读取
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (this.onmessage) {
                this.onmessage(data as JSONRPCMessage);
              }
            } catch {
              // 跳过非 JSON 的 SSE 事件
            }
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    this._sessionId = null;
    if (this.onclose) this.onclose();
  }
}

export class StreamableHttpMCPClient implements MCPClientInstance {
  readonly name: string;
  readonly transportType = "streamable-http" as const;
  private config: StreamableHttpConfig;
  private client: Client;
  private transport: StreamableHTTPTransport | null = null;

  constructor(name: string, config: StreamableHttpConfig) {
    this.name = name;
    this.config = config;
    this.client = new Client({ name: `mcp-lab-${name}`, version: "0.1.0" });
  }

  async connect(): Promise<void> {
    this.transport = new StreamableHTTPTransport(this.config.url, this.config.headers);
    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // ignore
    }
  }

  async listTools(): Promise<MCPToolDef[]> {
    const result = await this.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    return this.client.callTool({ name, arguments: args as Record<string, unknown> | undefined });
  }
}
