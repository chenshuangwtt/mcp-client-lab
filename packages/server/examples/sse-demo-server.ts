/**
 * SSE Demo MCP Server
 *
 * 一个简单的 MCP SSE 服务器，提供几个 demo 工具用于测试。
 * 启动: pnpm dev:sse-demo
 * 端口: 8000（可通过 PORT 环境变量覆盖）
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const PORT = Number(process.env.PORT) || 8000;

const app = express();
app.use(express.json());

// 存活跃的 SSE 传输会话
const transports: Record<string, SSEServerTransport> = {};

// GET /sse — 客户端建立 SSE 流
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  console.log(`[SSE] 新会话: ${transport.sessionId}`);

  res.on("close", () => {
    console.log(`[SSE] 会话关闭: ${transport.sessionId}`);
    delete transports[transport.sessionId];
  });

  // 为每个会话创建一个 McpServer 实例
  const server = new McpServer({ name: "demo-sse", version: "1.0.0" });

  // 注册 demo 工具 — SSE 服务器：文本/交互类

  // 1. echo — 回显输入
  server.tool(
    "echo",
    "回显输入的消息",
    { message: z.string().describe("要回显的消息") },
    async ({ message }) => ({
      content: [{ type: "text", text: `Echo: ${message}` }],
    })
  );

  // 2. reverse — 反转文本
  server.tool(
    "reverse",
    "反转输入的文本",
    { text: z.string().describe("要反转的文本") },
    async ({ text }) => ({
      content: [{ type: "text", text: `反转结果: ${text.split("").reverse().join("")}` }],
    })
  );

  // 3. word_count — 统计字数
  server.tool(
    "word_count",
    "统计文本的字符数和词数",
    { text: z.string().describe("要统计的文本") },
    async ({ text }) => {
      const chars = text.length;
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      return { content: [{ type: "text", text: `字符数: ${chars}, 词数: ${words}` }] };
    }
  );

  // 4. upper_lower — 大小写转换
  server.tool(
    "upper_lower",
    "将文本转为全大写或全小写",
    {
      text: z.string().describe("要转换的文本"),
      mode: z.enum(["upper", "lower"]).describe("upper=大写, lower=小写"),
    },
    async ({ text, mode }) => ({
      content: [{ type: "text", text: mode === "upper" ? text.toUpperCase() : text.toLowerCase() }],
    })
  );

  await server.connect(transport);
});

// POST /messages — 客户端发送 JSON-RPC 消息
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];

  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({ error: "未找到对应的会话" });
  }
});

app.listen(PORT, () => {
  console.log(`[SSE Demo Server] 已启动: http://localhost:${PORT}/sse`);
});
