import { Router } from "express";
import { MCPClientManager } from "../mcp/mcpClientManager.js";
import { loadServersConfig } from "../config/index.js";
import { logger } from "../utils/logger.js";

export function createServersRouter(manager: MCPClientManager, getActiveConfigPath?: () => string | undefined): Router {
  const router = Router();

  // GET /api/servers — 获取所有服务器状态
  router.get("/", (_req, res) => {
    const servers = manager.getAllServerInfo();
    res.json({ servers });
  });

  // POST /api/servers/reload — 从 mcp-servers.json 重新加载配置
  router.post("/reload", async (_req, res) => {
    try {
      const config = await loadServersConfig(getActiveConfigPath?.());

      for (const name of manager.getServerNames()) {
        await manager.disconnect(name).catch(() => {});
        manager.unregister(name);
      }

      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        manager.register(name, serverConfig);
        logger.info("server_registered", { name, transport: serverConfig.transport || "stdio" });
      }

      await manager.connectAll();
      res.json({ success: true, servers: manager.getAllServerInfo() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/servers/:name/connect — 连接指定服务器
  router.post("/:name/connect", async (req, res) => {
    try {
      await manager.connect(req.params.name);
      res.json({ success: true, server: manager.getServerInfo(req.params.name) });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        server: manager.getServerInfo(req.params.name),
      });
    }
  });

  // POST /api/servers/:name/disconnect — 断开指定服务器
  router.post("/:name/disconnect", async (req, res) => {
    try {
      await manager.disconnect(req.params.name);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/servers/:name/tools/refresh — 刷新工具列表
  router.post("/:name/tools/refresh", async (req, res) => {
    try {
      const tools = await manager.refreshTools(req.params.name);
      res.json({ success: true, tools });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
