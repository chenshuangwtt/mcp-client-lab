# MCP Client Lab

> 🧪 用于学习 MCP Client 原理、调试 MCP Server、**可视化观察工具调用链路**的实验项目。

## 项目定位

**mcp-client-lab** 不是生产级 Agent 框架，而是用于：

- **学习** MCP Client 工作原理
- **调试** MCP Server 的工具调用
- **可视化** 观察一次 MCP 工具调用的完整链路

核心价值：**把 tools/list → LLM 工具选择 → tools/call → 结果回传 → 最终回答的全过程用 Web 页面展示出来。**

## 支持三种 Transport

| Transport | 说明 | 适用场景 |
|-----------|------|----------|
| **stdio** | 通过 stdin/stdout 启动本地子进程 | 本地 MCP Server |
| **SSE** | 连接远程 SSE 端点 (`http://host:port/sse`) | 远程 MCP Server |
| **Streamable HTTP** | HTTP POST JSON-RPC (`http://host:port/mcp`) | 新版 MCP Server |

> ⚠️ Streamable HTTP Transport 为教学版最小实现，适合 Demo 和学习，不保证覆盖完整协议（如 resumability）。生产环境建议使用 MCP SDK 官方 Transport。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填写你的 API Key：

```bash
cp .env.example .env
```

### 3. 配置 MCP Server

编辑项目根目录 `mcp-servers.json`：

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  },
  "defaultServer": "filesystem"
}
```

### 4. 启动

```bash
pnpm dev
```

一条命令启动 4 个服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| server | 3001 | 后端 API |
| web | 5173 | 前端 UI |
| sse | 8000 | SSE Demo Server |
| http | 8001 | Streamable HTTP Demo Server |

也可以单独启动：

```bash
pnpm dev:server                        # 仅后端（默认配置）
pnpm dev:server -- --config ./custom.json  # 仅后端（指定配置）
pnpm dev:web                           # 仅前端
pnpm dev:sse-demo                      # 仅 SSE Demo
pnpm dev:http-demo                     # 仅 HTTP Demo
```

## 启动模式

```bash
pnpm dev:server
pnpm dev:server -- --config ./custom.json
```

`--config` 可指定 `mcp-servers.json` 路径，Servers 页面的「重载配置」会使用启动时传入的路径。

## Web UI

浏览器打开 `http://localhost:5173`：

- **Chat** — 输入问题，观察工具调用链路，支持 Markdown 渲染
  - 左侧可勾选本次参与对话的 MCP Server，只把选中 Server 的工具交给 LLM
  - 危险工具触发确认：确认后继续执行，取消后 Trace 立即记录 UserCancelled
- **Servers** — 查看连接状态、工具列表，重载配置
- **Traces** — 查看每次请求的完整时间线，按轮次分组，支持删除

## 内置 Demo Server 工具

两个 Demo Server 的工具完全不同，方便区分 transport 类型：

| SSE :8000（文本/交互类） | HTTP :8001（数字/计算类） |
|--------------------------|--------------------------|
| `echo` — 回显消息 | `add` — 两数相加 |
| `reverse` — 反转文本 | `multiply` — 两数相乘 |
| `word_count` — 统计字数 | `factorial` — 阶乘 |
| `upper_lower` — 大小写转换 | `fibonacci` — 斐波那契数列 |
| | `get_time` — 当前时间 |

## 一次工具调用的完整流程

```text
用户输入: "帮我列出 /tmp 的文件夹"
    ↓
① 从选中的已连接 Server 获取 tools/list
    ↓
② 将用户问题 + 工具列表发给 LLM
    ↓
③ LLM 决定调用 filesystem__list_directory 工具
    ↓
④ 检查工具名是否包含危险关键词
    ↓ (安全通过)
⑤ 调用 MCP Server 的 tools/call
    ↓
⑥ Server 返回目录列表
    ↓
⑦ 将工具结果回传给 LLM（可多轮调用）
    ↓
⑧ LLM 生成最终回答
    ↓
用户看到: Markdown 渲染的文件夹列表
```

每一步都记录在 Trace 中，可在 Trace 页面展开查看详情。

## 危险工具确认

工具名包含危险关键词时触发确认：

- `delete`, `remove`, `write`, `update`
- `send`, `execute`, `shell`, `sql`

行为：

- **确认**：继续执行工具，完成回答
- **取消**：后端 Trace 立即结束并记录 `UserCancelled`，前端显示「🚫 用户已取消」

## 日志

每次请求生成一个独立文件夹，日志和 Trace 放在一起：

```text
logs/
  20260530-145530-a1b2c3d4/
    trace.json               ← Trace 数据
    0-LLM Request.json       ← 日志（每文件夹独立计数）
    1-LLM Response-r0.json   ← r0 = 第 1 轮
    2-Tool Call-r0.json
    3-Tool Call Response-r0.json
    4-LLM Response-r1.json   ← r1 = 第 2 轮
```

## Trace 数据结构

所有 Trace 步骤的业务字段统一在 `data` 中：

```json
{
  "id": "user_message-0",
  "type": "user_message",
  "timestamp": "...",
  "round": 0,
  "data": { "content": "用户的问题" }
}
```

## 工具命名

多 Server 同名工具通过 `__`（双下划线）namespace 避免冲突，兼容 OpenAI API 命名规范 `^[a-zA-Z0-9_-]+$`：

| 显示名（LLM 看到） | 实际调用 |
|-------------------|---------|
| `filesystem__list_directory` | `list_directory` |
| `demo-sse__echo` | `echo` |

## 安全配置

可选环境变量（在 `.env` 中设置）：

| 变量 | 说明 |
|------|------|
| `WEB_ORIGIN` | CORS 允许的来源，不设置则允许所有 |
| `LAB_TOKEN` | API 访问令牌，设置后危险接口需要 `Authorization: Bearer <token>` |
| `VITE_LAB_TOKEN` | 前端令牌，配合 `LAB_TOKEN` 使用，前端自动携带 |

需要 Token 验证的接口：`POST /api/chat`、`POST /api/servers/reload`、`POST /api/servers/:name/connect|disconnect|tools/refresh`、`DELETE /api/traces/:traceId`

## 项目结构

```text
mcp-client-lab/
├── packages/
│   ├── server/                    # Express + TypeScript 后端
│   │   ├── src/
│   │   │   ├── config/            # 配置加载
│   │   │   ├── mcp/               # MCP Transport 实现
│   │   │   │   └── transports/    # stdio / sse / streamable-http
│   │   │   ├── llm/               # LLM 集成 + 工具映射
│   │   │   ├── trace/             # Trace 数据模型 + 存储
│   │   │   ├── routes/            # API 路由
│   │   │   └── utils/             # 日志工具
│   │   └── examples/              # Demo Server 源码
│   └── web/                       # React + Vite 前端
│       └── src/
│           ├── pages/             # Chat / Trace / Servers
│           └── api/               # API 客户端
├── examples/servers/              # 配置示例
├── logs/                          # 请求日志（运行时生成）
└── .env.example
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/servers | 获取所有 Server 状态 |
| POST | /api/servers/reload | 从配置文件重载 |
| POST | /api/servers/:name/connect | 连接 Server |
| POST | /api/servers/:name/disconnect | 断开 Server |
| POST | /api/servers/:name/tools/refresh | 刷新工具列表 |
| GET | /api/tools | 获取所有 namespace 后的工具 |
| POST | /api/chat | 发送消息（支持多轮工具调用） |
| POST | /api/chat/cancel-confirmation | 取消危险工具确认 |
| GET | /api/traces | 历史 Trace 列表 |
| GET | /api/traces/:traceId | 某次完整 Trace |
| DELETE | /api/traces/:traceId | 删除指定 Trace |
| GET | /api/health | 健康检查 |

## 许可证

MIT
