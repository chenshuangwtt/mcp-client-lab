#!/usr/bin/env node

/**
 * MCP Client Lab — 后端入口
 *
 * 支持两种模式：
 *   CLI 模式：node build/index.js <server-script>  (兼容旧版)
 *   Web 模式：node build/index.js                   (启动 Express 服务)
 */

import express from "express";
import cors from "cors";
import { validateEnv, getPort, loadServersConfig } from "./config/index.js";
import { MCPClientManager } from "./mcp/mcpClientManager.js";
import { createServersRouter } from "./routes/servers.js";
import { createToolsRouter } from "./routes/tools.js";
import { createChatRouter } from "./routes/chat.js";
import { createTracesRouter } from "./routes/traces.js";
import { logger } from "./utils/logger.js";

async function startWebServer() {
  // 验证环境变量
  validateEnv();

  // 加载 MCP Server 配置
  let configPath = process.argv[2] || undefined;
  const config = await loadServersConfig(configPath);

  // 初始化 Manager
  const manager = new MCPClientManager();

  // 注册所有服务器
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    manager.register(name, serverConfig);
    logger.info("server_registered", { name, transport: serverConfig.transport || "stdio" });
  }

  // 连接所有服务器
  logger.info("connecting_servers");
  await manager.connectAll();

  const serverCount = manager.getAllServerInfo().length;
  const connectedCount = manager.getAllServerInfo().filter((s) => s.state === "connected").length;
  logger.info("servers_connected", { connected: connectedCount, total: serverCount });

  // 创建 Express 应用
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 挂载路由
  app.use("/api/servers", createServersRouter(manager));
  app.use("/api/tools", createToolsRouter(manager));
  app.use("/api/chat", createChatRouter(manager));
  app.use("/api/traces", createTracesRouter());

  // 健康检查
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // 启动
  const port = getPort();
  app.listen(port, () => {
    logger.info("server_started", { port, api: `http://localhost:${port}/api`, web: "http://localhost:5173" });
  });
}

// 判断是否 CLI 模式（有命令行参数且不是 --web 或端口）
const isCLI = process.argv.length >= 3 && !process.argv[2].startsWith("--");

if (isCLI) {
  // CLI 模式 — 加载旧版 MCPClient 保持兼容
  logger.info("cli_mode");
  const { main } = await import("./cli.js");
  await main();
} else {
  // Web 模式
  startWebServer().catch((err) => {
    logger.error("server_start_failed", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
