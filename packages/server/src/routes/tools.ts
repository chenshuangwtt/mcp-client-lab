import { Router } from "express";
import { MCPClientManager } from "../mcp/mcpClientManager.js";

export function createToolsRouter(manager: MCPClientManager): Router {
  const router = Router();

  // GET /api/tools — 获取所有 namespace 后的工具
  router.get("/", (_req, res) => {
    const tools = manager.getAllNamespacedTools();
    res.json({ tools });
  });

  return router;
}
