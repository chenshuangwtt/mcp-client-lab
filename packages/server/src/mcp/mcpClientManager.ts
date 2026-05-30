import { MCPClientInstance, MCPToolDef } from "./types.js";
import { StdioMCPClient, StdioConfig } from "./transports/stdio.js";
import { SSEMCPClient } from "./transports/sse.js";
import { StreamableHttpMCPClient } from "./transports/streamableHttp.js";
import { MCPServerRawConfig } from "../config/index.js";
import { ToolMapper, NamespacedTool } from "../llm/toolMapper.js";
import { logger } from "../utils/logger.js";

export type ServerConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface ServerInfo {
  name: string;
  transportType: "stdio" | "sse" | "streamable-http";
  state: ServerConnectionState;
  error?: string;
  tools: MCPToolDef[];
}

export class MCPClientManager {
  private clients: Map<string, MCPClientInstance> = new Map();
  private states: Map<string, ServerConnectionState> = new Map();
  private errors: Map<string, string> = new Map();
  private toolsCache: Map<string, MCPToolDef[]> = new Map();
  private toolMapper: ToolMapper = new ToolMapper();

  /** 根据配置注册一个 MCP Server */
  register(name: string, config: MCPServerRawConfig): void {
    let client: MCPClientInstance;

    if (config.transport === "sse") {
      client = new SSEMCPClient(name, { url: config.url, headers: config.headers });
    } else if (config.transport === "streamable-http") {
      client = new StreamableHttpMCPClient(name, { url: config.url, headers: config.headers });
    } else {
      // stdio (default)
      client = new StdioMCPClient(name, {
        command: config.command,
        args: config.args || [],
        env: (config as { env?: Record<string,string> }).env,
      } as StdioConfig);
    }

    this.clients.set(name, client);
    this.states.set(name, "disconnected");
  }

  /** 移除一个服务器 */
  unregister(name: string): void {
    this.clients.delete(name);
    this.states.delete(name);
    this.errors.delete(name);
    this.toolsCache.delete(name);
    this.toolMapper.removeServer(name);
  }

  /** 获取所有已注册的服务器名 */
  getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /** 获取所有服务器状态 */
  getAllServerInfo(): ServerInfo[] {
    return this.getServerNames().map((name) => ({
      name,
      transportType: this.clients.get(name)!.transportType,
      state: this.states.get(name) || "disconnected",
      error: this.errors.get(name),
      tools: this.toolsCache.get(name) || [],
    }));
  }

  /** 获取单个服务器状态 */
  getServerInfo(name: string): ServerInfo | null {
    const client = this.clients.get(name);
    if (!client) return null;
    return {
      name,
      transportType: client.transportType,
      state: this.states.get(name) || "disconnected",
      error: this.errors.get(name),
      tools: this.toolsCache.get(name) || [],
    };
  }

  /** 连接指定服务器 */
  async connect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) throw new Error(`未知服务器: ${name}`);

    this.states.set(name, "connecting");
    this.errors.delete(name);

    try {
      await client.connect();
      this.states.set(name, "connected");
      // 连接后自动获取工具列表
      await this.refreshTools(name);
    } catch (err) {
      this.states.set(name, "error");
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.set(name, msg);
      throw err;
    }
  }

  /** 断开指定服务器 */
  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) throw new Error(`未知服务器: ${name}`);

    try {
      await client.disconnect();
    } finally {
      this.states.set(name, "disconnected");
      this.toolsCache.delete(name);
      this.toolMapper.removeServer(name);
    }
  }

  /** 刷新工具列表 */
  async refreshTools(name: string): Promise<MCPToolDef[]> {
    const client = this.clients.get(name);
    if (!client) throw new Error(`未知服务器: ${name}`);

    const tools = await client.listTools();
    this.toolsCache.set(name, tools);
    this.toolMapper.registerServer(name, tools);
    return tools;
  }

  /** 获取所有 namespace 后的工具（LLM 可见） */
  getAllNamespacedTools(): NamespacedTool[] {
    return this.toolMapper.getAllTools();
  }

  /** 根据 displayName 解析并调用工具 */
  async callTool(displayName: string, args: unknown): Promise<{ serverName: string; result: unknown }> {
    const parsed = this.toolMapper.parseDisplayName(displayName);
    if (!parsed) throw new Error(`无效的工具名: ${displayName}`);

    const { serverName, rawToolName } = parsed;
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`服务器 ${serverName} 未注册`);
    if (this.states.get(serverName) !== "connected") {
      throw new Error(`服务器 ${serverName} 未连接`);
    }

    const result = await client.callTool(rawToolName, args);
    return { serverName, result };
  }

  /** 同时连接所有已注册的服务器 */
  async connectAll(): Promise<void> {
    const names = this.getServerNames();
    await Promise.all(
      names.map((n) =>
        this.connect(n).catch((err) => {
          logger.error("connect_failed", { server: n, error: err instanceof Error ? err.message : String(err) });
        })
      )
    );
  }

  /** 清理所有连接 */
  async disconnectAll(): Promise<void> {
    for (const name of this.getServerNames()) {
      await this.disconnect(name).catch(() => {});
    }
  }
}
