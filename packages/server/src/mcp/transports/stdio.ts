import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPClientInstance, MCPToolDef } from "../types.js";

export interface StdioConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class StdioMCPClient implements MCPClientInstance {
  readonly name: string;
  readonly transportType = "stdio" as const;
  private config: StdioConfig;
  private client: Client;
  private transport: StdioClientTransport | null = null;

  constructor(name: string, config: StdioConfig) {
    this.name = name;
    this.config = config;
    this.client = new Client({ name: `mcp-lab-${name}`, version: "0.1.0" });
  }

  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      ...(this.config.env ? { env: this.config.env } : {}),
    } as any);

    // 30 秒超时
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("连接超时（30s）")), 30_000)
    );
    await Promise.race([this.client.connect(this.transport), timeout]);
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // ignore close errors
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
