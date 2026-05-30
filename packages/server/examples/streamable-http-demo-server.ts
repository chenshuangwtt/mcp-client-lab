/**
 * Streamable HTTP Demo MCP Server
 *
 * 启动: npx tsx examples/streamable-http-demo-server.ts
 * 端口: 8001（可通过 PORT 环境变量覆盖）
 * 端点: POST/GET/DELETE http://localhost:8001/mcp
 */

import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const PORT = Number(process.env.PORT) || 8001;
const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

function registerTools(server: McpServer) {
  // Streamable HTTP 服务器：数字/计算类

  server.tool("add", "两数相加",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({ content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }] })
  );

  server.tool("multiply", "两数相乘",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({ content: [{ type: "text", text: `${a} × ${b} = ${a * b}` }] })
  );

  server.tool("factorial", "计算阶乘",
    { n: z.number().int().min(0).describe("非负整数") },
    async ({ n }) => {
      if (n > 20) return { content: [{ type: "text", text: "n 太大了（≤20）" }], isError: true };
      let result = 1;
      for (let i = 2; i <= n; i++) result *= i;
      return { content: [{ type: "text", text: `${n}! = ${result}` }] };
    }
  );

  server.tool("fibonacci", "生成斐波那契数列前 N 项",
    { n: z.number().int().min(1).max(30).describe("项数（1-30）") },
    async ({ n }) => {
      const seq: number[] = [0, 1];
      for (let i = 2; i < n; i++) seq.push(seq[i - 1] + seq[i - 2]);
      return { content: [{ type: "text", text: `前 ${n} 项: ${seq.slice(0, n).join(", ")}` }] };
    }
  );

  server.tool("get_time", "获取当前服务器时间", {},
    async () => ({ content: [{ type: "text", text: `当前时间: ${new Date().toLocaleString("zh-CN")}` }] })
  );
}

// POST /mcp — 处理 JSON-RPC 消息
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { transports[sid] = transport; },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const server = new McpServer({ name: "demo-streamable-http", version: "1.0.0" });
    registerTools(server);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
  }
});

// GET /mcp — SSE 流
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) { res.status(400).send("Invalid session"); return; }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE /mcp — 关闭会话
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) { res.status(400).send("Invalid session"); return; }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`[Streamable HTTP Demo] 已启动: http://localhost:${PORT}/mcp`);
});
