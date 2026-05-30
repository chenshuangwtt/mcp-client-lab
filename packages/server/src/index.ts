#!/usr/bin/env node

/**
 * MCP Client Lab — 后端入口
 *
 * 启动方式：
 *   pnpm dev:server                          → 默认配置
 *   pnpm dev:server -- --config ./custom.json → 指定配置
 */

import express from "express";
import cors from "cors";
import path from "path";
import { validateEnv, getPort, loadServersConfig } from "./config/index.js";
import { MCPClientManager } from "./mcp/mcpClientManager.js";
import { createServersRouter } from "./routes/servers.js";
import { createToolsRouter } from "./routes/tools.js";
import { createChatRouter } from "./routes/chat.js";
import { createTracesRouter } from "./routes/traces.js";
import { logger } from "./utils/logger.js";

// ===== 参数解析 =====

function parseConfigPath(argv: string[]): string | undefined {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && i + 1 < args.length) {
      return path.resolve(args[i + 1]);
    }
    // 兼容旧写法：第一个非 -- 参数如果是 .json 文件
    if (!args[i].startsWith("--") && (args[i].endsWith(".json") || args[i].includes("mcp-servers"))) {
      return path.resolve(args[i]);
    }
  }
  return undefined;
}

// ===== 共享状态：configPath 供 reload 使用 =====

let activeConfigPath: string | undefined;

// ===== 启动 =====

async function start() {
  validateEnv();

  activeConfigPath = parseConfigPath(process.argv);
  const config = await loadServersConfig(activeConfigPath);

  const manager = new MCPClientManager();

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    manager.register(name, serverConfig);
    logger.info("server_registered", { name, transport: serverConfig.transport || "stdio" });
  }

  logger.info("connecting_servers");
  await manager.connectAll();

  const serverCount = manager.getAllServerInfo().length;
  const connectedCount = manager.getAllServerInfo().filter((s) => s.state === "connected").length;
  logger.info("servers_connected", { connected: connectedCount, total: serverCount });

  const app = express();

  // CORS 配置
  const webOrigin = process.env.WEB_ORIGIN;
  if (webOrigin) {
    app.use(cors({ origin: webOrigin }));
  } else {
    app.use(cors());
  }

  app.use(express.json());

  // Token 验证中间件（仅保护危险接口）
  const labToken = process.env.LAB_TOKEN;
  if (labToken) {
    const dangerousPaths = ["/api/chat", "/api/servers/reload"];
    app.use((req, res, next) => {
      const isDangerous = req.method === "DELETE"
        || (req.method === "POST" && (dangerousPaths.some(p => req.path.startsWith(p)) || req.path.match(/^\/api\/servers\/[^/]+\/(connect|disconnect|tools\/refresh)$/)));
      if (isDangerous) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${labToken}`) {
          res.status(401).json({ error: "Unauthorized: 需要有效的 LAB_TOKEN" });
          return;
        }
      }
      next();
    });
  }

  // 挂载路由
  app.use("/api/servers", createServersRouter(manager, () => activeConfigPath));
  app.use("/api/tools", createToolsRouter(manager));
  app.use("/api/chat", createChatRouter(manager));
  app.use("/api/traces", createTracesRouter());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  const port = getPort();
  app.listen(port, () => {
    logger.info("server_started", { port, api: `http://localhost:${port}/api`, web: "http://localhost:5173" });
  });
}

start().catch((err) => {
  logger.error("server_start_failed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
