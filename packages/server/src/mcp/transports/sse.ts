import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { MCPClientInstance, MCPToolDef } from "../types.js";

export interface SSEConfig {
  url: string;
  headers?: Record<string, string>;
}

export class SSEMCPClient implements MCPClientInstance {
  readonly name: string;
  readonly transportType = "sse" as const;
  private config: SSEConfig;
  private client: Client;
  private transport: SSEClientTransport | null = null;

  constructor(name: string, config: SSEConfig) {
    this.name = name;
    this.config = config;
    this.client = new Client({ name: `mcp-lab-${name}`, version: "0.1.0" });
  }

  async connect(): Promise<void> {
    // 先关闭已有连接
    await this.disconnect().catch(() => {});
    this.client = new Client({ name: `mcp-lab-${this.name}`, version: "0.1.0" });
    this.transport = new SSEClientTransport(new URL(this.config.url), {
      requestInit: this.config.headers ? { headers: this.config.headers } : undefined,
    });
    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // ignore
    }
    this.transport = null;
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
