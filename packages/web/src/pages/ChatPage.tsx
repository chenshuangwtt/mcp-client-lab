import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ServerInfo } from "../api/index.js";

/** 修复 LLM 生成的单行表格 → 标准 Markdown 多行表格 */
function fixInlineTables(text: string): string {
  return text.replace(/^(\|.+?\|)\s*$/gm, (line) => {
    // 已经是多行表格的一部分，跳过
    if (line.includes("\n")) return line;

    // 按 | 分割出所有单元格
    const raw = line.split("|");
    // 去掉首尾空串（|开头结尾会产生空串）
    const cells = raw.slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) return line;

    // 找分隔行（全是 - 或 : 的单元格）
    const sepIdx = cells.findIndex((c) => /^[-:\s]+$/.test(c) && c.includes("-"));
    if (sepIdx <= 0) return line; // 没找到分隔行，不是表格

    const cols = sepIdx;
    const rows: string[] = [];

    // 表头
    rows.push("| " + cells.slice(0, cols).join(" | ") + " |");
    // 分隔行
    rows.push("|" + cells.slice(cols, cols * 2).map((c) => ` ${c} `).join("|") + "|");
    // 数据行
    for (let i = cols * 2; i < cells.length; i += cols) {
      rows.push("| " + cells.slice(i, i + cols).join(" | ") + " |");
    }

    return rows.join("\n");
  });
}

type ChatMessage = { role: string; content: string };

const CHAT_STORAGE_KEY = "mcp-client-lab-chat";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMessages(msgs: ChatMessage[]): void {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs));
}

export default function ChatPage() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [currentSteps, setCurrentSteps] = useState<string[]>([]);
  const [confirmInfo, setConfirmInfo] = useState<{ traceId: string; toolName: string; arguments: Record<string, unknown> } | null>(null);
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { refreshServers(); }, []);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { saveMessages(messages); }, [messages]);

  const connectedServers = servers.filter((s) => s.state === "connected");
  const selectedServerList = servers.filter((s) => selectedServers.has(s.name) && s.state === "connected");
  const selectedTools = selectedServerList.reduce((sum, s) => sum + s.tools.length, 0);

  /** 刷新 Server 状态并同步选中 */
  async function refreshServers() {
    const r = await api.getServers();
    setServers(r.servers);
    const connectedNames = new Set(r.servers.filter((s) => s.state === "connected").map((s) => s.name));
    setSelectedServers((prev) => {
      const next = new Set([...prev].filter((name) => connectedNames.has(name)));
      if (next.size === 0) {
        for (const name of connectedNames) next.add(name);
      }
      return next;
    });
  }

  async function handleSend(confirm?: { traceId: string; toolName: string; arguments: Record<string, unknown> }) {
    if (!input.trim() && !confirm) return;

    // 非 confirm 模式下校验至少选中一个 Server
    if (!confirm && selectedTools === 0) {
      setMessages((prev) => [...prev, { role: "error", content: "请至少选择一个已连接的 MCP Server，或确认当前问题不需要工具。" }]);
      return;
    }

    const userMsg = confirm ? "" : input.trim();

    if (!confirm) {
      setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    }
    setInput("");
    setLoading(true);
    setConfirmInfo(null);
    setCurrentSteps(["thinking"]);

    try {
      const serverNames = confirm ? undefined : Array.from(selectedServers);
      const res = await api.sendMessage(userMsg, confirm, serverNames);
      setCurrentTraceId(res.traceId);

      if (res.status === "need_confirmation" && res.toolName) {
        setConfirmInfo({ traceId: res.traceId, toolName: res.toolName, arguments: res.arguments || {} });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ 工具 "${res.toolName}" 包含危险操作关键词，请确认是否执行。` },
        ]);
        setCurrentSteps(["waiting_confirmation"]);
      } else if (res.status === "success" && res.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.answer! }]);
        if (res.toolCalls && res.toolCalls.length > 0) {
          setCurrentSteps(["tools_list", "llm_decision", "tool_call", "tool_result", "final_llm", "done"]);
        } else {
          setCurrentSteps(["done"]);
        }
      } else if (res.status === "error") {
        setMessages((prev) => [...prev, { role: "error", content: `错误: ${res.error}` }]);
        setCurrentSteps(["error"]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: `请求失败: ${err instanceof Error ? err.message : String(err)}` }]);
      setCurrentSteps(["error"]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(yes: boolean) {
    if (yes && confirmInfo) {
      handleSend(confirmInfo);
    } else if (confirmInfo) {
      try {
        await api.cancelConfirmation(confirmInfo.traceId);
        setConfirmInfo(null);
        setMessages((prev) => [...prev, { role: "assistant", content: "🚫 已取消危险工具调用。" }]);
        setCurrentSteps(["cancelled"]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "error", content: `取消失败: ${err instanceof Error ? err.message : String(err)}` },
        ]);
        setCurrentSteps(["error"]);
        // 不清空 confirmInfo，用户可以再次选择
      }
    }
  }

  return (
    <div className="grid grid-cols-[260px_1fr_280px] gap-4 h-[calc(100vh-80px)]">
      {/* 左侧面板：Server 列表 */}
      <div className="bg-card border border-border rounded-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-text-dim uppercase tracking-wide">MCP Servers</div>
          <button
            onClick={() => refreshServers().catch((err) => {
              setMessages((prev) => [...prev, { role: "error", content: `刷新失败: ${err instanceof Error ? err.message : String(err)}` }]);
            })}
            className="text-xs text-text-dim hover:text-accent cursor-pointer px-1"
            title="刷新状态"
          >
            ↻
          </button>
        </div>
        {servers.map((s) => (
          <div key={s.name} className={`flex items-center gap-2 p-2 rounded-md text-sm transition-colors ${s.state === "connected" ? "hover:bg-hover cursor-pointer" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={selectedServers.has(s.name)}
              disabled={s.state !== "connected"}
              onChange={() => {
                setSelectedServers((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.name)) next.delete(s.name);
                  else next.add(s.name);
                  return next;
                });
              }}
              className="accent-accent cursor-pointer"
            />
            <span className={`dot ${s.state}`} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-xs text-text-dim">{s.tools.length}</span>
          </div>
        ))}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-1">已选工具</div>
          <div className="text-sm text-accent font-semibold">{selectedTools} / {connectedServers.reduce((sum, s) => sum + s.tools.length, 0)} 个工具</div>
        </div>
      </div>

      {/* 中间：对话区 */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col">
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-text-dim">
              <p>输入问题开始体验 MCP 工具调用链路</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`px-4 py-3 rounded-xl text-sm leading-relaxed max-w-[85%] ${
                m.role === "user"
                  ? "bg-accent-dim text-white self-end"
                  : m.role === "error"
                  ? "bg-danger/10 text-danger self-start"
                  : "bg-hover self-start"
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table className="w-full border-collapse text-xs my-2">
                        {children}
                      </table>
                    ),
                    th: ({ children }) => (
                      <th className="border border-border px-2 py-1 bg-bg text-left font-semibold">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-border px-2 py-1">{children}</td>
                    ),
                    code: ({ children, className }) => {
                      const isBlock = className?.includes("language-");
                      return isBlock ? (
                        <pre className="bg-bg rounded-md p-2 my-1 overflow-x-auto text-xs">
                          <code>{children}</code>
                        </pre>
                      ) : (
                        <code className="bg-bg/50 px-1 py-0.5 rounded text-xs">{children}</code>
                      );
                    },
                    pre: ({ children }) => <>{children}</>,
                    p: ({ children }) => <p className="my-1">{children}</p>,
                    ul: ({ children }) => <ul className="my-1 pl-4 list-disc">{children}</ul>,
                    ol: ({ children }) => <ol className="my-1 pl-4 list-decimal">{children}</ol>,
                    li: ({ children }) => <li className="my-0.5">{children}</li>,
                  }}
                >
                  {fixInlineTables(m.content)}
                </ReactMarkdown>
              )}
            </div>
          ))}

          {confirmInfo && (
            <div className="mt-3 p-3 bg-warning/10 border border-warning rounded-lg text-sm">
              <strong>⚠️ 危险工具确认</strong>
              <p className="mt-1">调用工具: <code className="text-accent">{confirmInfo.toolName}</code></p>
              <p>参数: <pre className="text-xs mt-1">{JSON.stringify(confirmInfo.arguments, null, 2)}</pre></p>
              <div className="flex gap-2 mt-2">
                <button
                  className="px-4 py-1.5 bg-danger text-white rounded-md text-sm cursor-pointer"
                  onClick={() => handleConfirm(true)}
                >
                  确认执行
                </button>
                <button
                  className="px-4 py-1.5 bg-hover text-text rounded-md text-sm cursor-pointer"
                  onClick={() => handleConfirm(false)}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <input
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
            placeholder="输入问题..."
            disabled={loading}
          />
          <button
            className="px-5 py-2.5 bg-accent text-white rounded-lg text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            {loading ? "..." : "发送"}
          </button>
          {messages.length > 0 && (
            <button
              className="px-3 py-2.5 bg-hover text-text-dim rounded-lg text-sm cursor-pointer hover:text-danger"
              onClick={() => { setMessages([]); setCurrentSteps([]); setCurrentTraceId(null); }}
              title="清空聊天"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 右侧：状态面板 */}
      <div className="bg-card border border-border rounded-xl p-4 overflow-y-auto">
        <div className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">执行状态</div>
        {currentSteps.length === 0 && !loading && (
          <div className="text-sm text-text-dim">等待输入...</div>
        )}
        {loading && (
          <div className="px-2 py-1.5 text-xs text-accent border-l-2 border-accent mb-1">处理中...</div>
        )}
        {currentSteps.map((step, i) => (
          <div
            key={i}
            className={`px-2 py-1.5 text-xs mb-0.5 border-l-2 ${
              step === "done"
                ? "text-success border-success"
                : step === "error"
                ? "text-danger border-danger"
                : step === "cancelled"
                ? "text-warning border-warning"
                : step === "waiting_confirmation"
                ? "text-accent border-accent"
                : "text-text-dim border-border"
            }`}
          >
            {step === "thinking" && "🤔 LLM 思考中..."}
            {step === "tools_list" && "🔧 获取工具列表..."}
            {step === "llm_decision" && "🧠 LLM 决策工具调用"}
            {step === "tool_call" && "⚡ 执行 MCP 工具调用"}
            {step === "tool_result" && "📦 收到工具结果"}
            {step === "final_llm" && "🔄 回传 LLM 生成最终回答"}
            {step === "done" && "✅ 完成"}
            {step === "error" && "❌ 出错"}
            {step === "cancelled" && "🚫 用户已取消"}
            {step === "waiting_confirmation" && "⚠️ 等待确认"}
          </div>
        ))}
        {currentTraceId && (currentSteps.includes("done") || currentSteps.includes("cancelled") || currentSteps.includes("error")) && (
          <Link
            to={`/traces/${currentTraceId}`}
            className="block mt-2 px-3 py-1.5 bg-accent text-white rounded-md text-xs text-center no-underline"
          >
            查看 Trace
          </Link>
        )}
      </div>
    </div>
  );
}
