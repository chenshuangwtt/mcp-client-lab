import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { api, TraceData } from "../api/index.js";

/** 修复 LLM 生成的单行表格 → 标准 Markdown 多行表格 */
function fixInlineTables(text: string): string {
  return text.replace(/^(\|.+?\|)\s*$/gm, (line) => {
    if (line.includes("\n")) return line;
    const raw = line.split("|");
    const cells = raw.slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) return line;
    const sepIdx = cells.findIndex((c) => /^[-:\s]+$/.test(c) && c.includes("-"));
    if (sepIdx <= 0) return line;
    const cols = sepIdx;
    const rows: string[] = [];
    rows.push("| " + cells.slice(0, cols).join(" | ") + " |");
    rows.push("|" + cells.slice(cols, cols * 2).map((c) => ` ${c} `).join("|") + "|");
    for (let i = cols * 2; i < cells.length; i += cols) {
      rows.push("| " + cells.slice(i, i + cols).join(" | ") + " |");
    }
    return rows.join("\n");
  });
}

let mermaidCounter = 0;
mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { fontSize: "13px" }, securityLevel: "loose" });

/** 从 Trace 步骤生成 Mermaid 时序图 */
function generateSequenceDiagram(trace: TraceData): string {
  const lines: string[] = [
    "sequenceDiagram",
    "    participant U as User",
    "    participant L as LLM",
    "    participant M as MCP Server",
  ];
  const d = (step: any): Record<string, unknown> => step.data ?? step;
  let prevRound = -1;

  for (const step of trace.steps) {
    const round = (step as any).round ?? 0;
    if (round > prevRound && round > 0) {
      lines.push(`    Note over U,M: 第 ${round + 1} 轮`);
      prevRound = round;
    }
    const s = d(step);

    switch (step.type) {
      case "user_message":
        lines.push(`    U->>L: ${String(s.content).slice(0, 50).replace(/[\n\r]/g, " ")}`);
        break;
      case "llm_tool_decision":
        if (s.invoked) {
          lines.push(`    L->>L: 决策调用 ${s.toolName}`);
        }
        break;
      case "mcp_tool_call":
        lines.push(`    L->>M: ${s.toolName}()`);
        break;
      case "mcp_tool_result":
        lines.push(`    M-->>L: 返回结果`);
        break;
      case "final_answer":
        lines.push(`    L-->>U: ${String(s.content).slice(0, 50).replace(/[\n\r]/g, " ")}`);
        break;
      case "error":
        lines.push(`    Note over U,M: Error - ${String(s.message).slice(0, 40).replace(/[\n\r]/g, " ")}`);
        break;
    }
  }
  return lines.join("\n");
}

/** Mermaid 渲染组件 */
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const renderId = `mermaid-diagram-${mermaidCounter++}`;
    mermaid
      .render(renderId, code)
      .then((result) => { setSvg(result.svg); setError(false); })
      .catch(() => { setError(true); });
  }, [code]);

  if (error || !svg) return null;
  return <div className="overflow-x-auto my-4 p-4 bg-card border border-border rounded-xl" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN");
}

function MarkdownAnswer({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {fixInlineTables(content)}
      </ReactMarkdown>
    </div>
  );
}

function isUserCancelled(trace: TraceData): boolean {
  const last = trace.steps[trace.steps.length - 1];
  if (!last) return false;
  const d: Record<string, unknown> = (last as any).data ?? last;
  return last.type === "error" && d.type === "UserCancelled";
}

function stepTitle(type: string): string {
  const map: Record<string, string> = {
    user_message: "💬 用户消息",
    tools_list: "🔧 工具列表获取",
    llm_request: "🧠 LLM 请求",
    llm_tool_decision: "🎯 LLM 工具决策",
    mcp_tool_call: "⚡ MCP 工具调用",
    mcp_tool_result: "📦 工具执行结果",
    final_llm_request: "🔄 最终 LLM 请求",
    final_answer: "✅ 最终回答",
    error: "❌ 错误",
  };
  return map[type] || type;
}

function StepBody({ step }: { step: any }) {
  const [expanded, setExpanded] = useState(false);

  // 兼容新旧格式：新格式 step.data 存业务字段，旧格式直接在 step 上
  const d: Record<string, unknown> = step.data ?? step;
  const isError = step.type === "error";
  const alwaysShow = step.type === "user_message" || step.type === "final_answer";

  return (
    <div className={`timeline-step ${isError ? "error" : "active"}`}>
      <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <span className="font-semibold text-xs uppercase tracking-wide text-accent">
          {stepTitle(step.type)}
        </span>
        <span className="text-xs text-text-dim">{formatTime(step.timestamp)}</span>
        {!alwaysShow && <span className="text-xs text-text-dim ml-auto">{expanded ? "收起" : "展开"}</span>}
      </div>
      {(expanded || alwaysShow) && (
        <div className="mt-2 text-sm bg-bg p-3 rounded-md overflow-x-auto">
          {step.type === "user_message" && <p>{d.content as string}</p>}

          {step.type === "tools_list" && Array.isArray(d.servers) && (
            <div>
              <p>Servers: {(d.servers as string[]).join(", ")}</p>
              {Array.isArray(d.tools) && (
                <pre className="text-xs">{JSON.stringify((d.tools as any[]).map((t) => ({ displayName: t.displayName, description: t.description })), null, 2)}</pre>
              )}
            </div>
          )}

          {step.type === "llm_request" && (
            <pre className="text-xs">{JSON.stringify(d, null, 2)}</pre>
          )}

          {step.type === "llm_tool_decision" && (
            <pre className="text-xs">{JSON.stringify(d, null, 2)}</pre>
          )}

          {step.type === "mcp_tool_call" && (
            <div>
              <p>Server: <code className="text-accent">{(d.serverName as string) || "N/A"}</code></p>
              <p>Tool: <code className="text-accent">{d.toolName as string}</code></p>
              <p>耗时: {d.durationMs as number}ms</p>
              <pre className="text-xs">参数: {JSON.stringify(d.arguments, null, 2)}</pre>
            </div>
          )}

          {step.type === "mcp_tool_result" && (
            <div>
              <p>{d.truncated ? "⚠️ 结果已截断" : "完整结果"}</p>
              <pre className="text-xs">{typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2)}</pre>
            </div>
          )}

          {step.type === "final_llm_request" && (
            <pre className="text-xs">{JSON.stringify(d, null, 2)}</pre>
          )}

          {step.type === "final_answer" && (
            <MarkdownAnswer content={(d.content as string) || ""} />
          )}

          {step.type === "error" && (
            <div className="text-danger">
              <p><strong>{d.type as string}</strong></p>
              <p>{d.message as string}</p>
              <p>发生在步骤: {d.step as string}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TracePage() {
  const { traceId } = useParams();
  const navigate = useNavigate();
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [traces, setTraces] = useState<TraceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (traceId) {
      setLoading(true);
      api.getTrace(traceId)
        .then((r) => { setTrace(r.trace); setLoading(false); })
        .catch((err) => { setError(err.message); setLoading(false); });
    } else {
      setLoading(true);
      api.getTraces()
        .then((r) => { setTraces(r.traces); setLoading(false); })
        .catch((err) => { setError(err.message); setLoading(false); });
    }
  }, [traceId]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除这条 Trace？")) return;
    try {
      await api.deleteTrace(id);
      if (traceId) {
        navigate("/traces");
      } else {
        setTraces((prev) => prev.filter((t) => t.traceId !== id));
      }
    } catch (err) {
      alert(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (loading) return <div className="text-center py-8 text-text-dim">加载中...</div>;
  if (error) return <div className="p-4 bg-danger/10 border border-danger rounded-lg text-danger my-4">{error}</div>;

  // Trace 列表视图
  if (!traceId) {
    return (
      <div className="max-w-225 mx-auto">
        <h2 className="text-xl font-semibold">Trace 历史记录</h2>
        {traces.length === 0 && (
          <div className="text-center py-12 text-text-dim">
            暂无 Trace 记录。在 Chat 页面发送消息后会自动生成。
          </div>
        )}
        <div className="flex flex-col gap-2 mt-4">
          {traces.map((t) => (
            <div key={t.traceId} className="flex items-center gap-4 px-4 py-3 bg-card border border-border rounded-lg hover:bg-hover transition-colors group">
              <Link
                to={`/traces/${t.traceId}`}
                className="flex-1 no-underline text-text"
              >
                <div className="font-semibold text-sm">
                  {t.userMessage.slice(0, 60)}{t.userMessage.length > 60 ? "..." : ""}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-text-dim">
                  <span>{new Date(t.startedAt).toLocaleString("zh-CN")}</span>
                  <span>{t.steps.length} 步</span>
                  <span className={t.status === "success" ? "text-success" : t.status === "error" && isUserCancelled(t) ? "text-warning" : "text-danger"}>
                    {t.status === "success" ? "✅ 成功" : t.status === "error" && isUserCancelled(t) ? "🚫 已取消" : t.status === "error" ? "❌ 失败" : "⏳ 运行中"}
                  </span>
                </div>
              </Link>
              <button
                onClick={(e) => handleDelete(t.traceId, e)}
                className="px-2 py-1 text-xs text-text-dim hover:text-danger hover:bg-danger/10 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 单个 Trace 详情
  if (!trace) return <div className="p-4 bg-danger/10 border border-danger rounded-lg text-danger">Trace 不存在</div>;

  return (
    <div className="max-w-225 mx-auto">
      <div className="mb-6">
        <Link to="/traces" className="text-sm text-accent no-underline hover:underline mb-3 inline-block">← 返回列表</Link>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trace 详情</h2>
          <button
            onClick={(e) => handleDelete(trace.traceId, e)}
            className="px-3 py-1.5 text-sm text-danger hover:bg-danger/10 rounded-md cursor-pointer border border-danger/30"
          >
            🗑 删除
          </button>
        </div>
        <div className="flex gap-4 mt-2 text-sm text-text-dim">
          <span>ID: {trace.traceId.slice(0, 8)}...</span>
          <span>{new Date(trace.startedAt).toLocaleString("zh-CN")}</span>
          <span>{trace.steps.length} 步</span>
          <span className={trace.status === "success" ? "text-success" : trace.status === "error" && isUserCancelled(trace) ? "text-warning" : "text-danger"}>
            {trace.status === "success" ? "✅ 成功" : trace.status === "error" && isUserCancelled(trace) ? "🚫 已取消" : trace.status === "error" ? "❌ 失败" : "⏳ 运行中"}
          </span>
        </div>
        <div className="mt-2 text-sm">
          <strong>问题:</strong> {trace.userMessage}
        </div>
      </div>

      <MermaidDiagram code={generateSequenceDiagram(trace)} />

      <div className="timeline">
        {trace.steps.map((step, i) => {
          const prevRound = i > 0 ? (trace.steps[i - 1] as any).round ?? 0 : -1;
          const currentRound = (step as any).round ?? 0;
          const showRoundHeader = currentRound > 0 && currentRound !== prevRound;
          return (
            <div key={i}>
              {showRoundHeader && (
                <div className="py-2 text-xs font-semibold text-text-dim border-t border-border mt-2 mb-1">
                  ── 第 {currentRound + 1} 轮工具调用 ──
                </div>
              )}
              <StepBody step={step} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
