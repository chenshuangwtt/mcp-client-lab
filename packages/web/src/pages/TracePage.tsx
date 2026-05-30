import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, TraceData } from "../api/index.js";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN");
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

  return (
    <div className={`timeline-step ${isError ? "error" : "active"}`} onClick={() => setExpanded(!expanded)}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-xs uppercase tracking-wide text-accent">
          {stepTitle(step.type)}
        </span>
        <span className="text-xs text-text-dim">{formatTime(step.timestamp)}</span>
      </div>
      {expanded && (
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

          {step.type === "final_answer" && <pre className="text-xs whitespace-pre-wrap">{d.content as string}</pre>}

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
                  <span className={t.status === "success" ? "text-success" : "text-danger"}>
                    {t.status === "success" ? "✅ 成功" : t.status === "error" ? "❌ 失败" : "⏳ 运行中"}
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
          <span className={trace.status === "success" ? "text-success" : "text-danger"}>
            {trace.status === "success" ? "✅ 成功" : trace.status === "error" ? "❌ 失败" : "⏳ 运行中"}
          </span>
        </div>
        <div className="mt-2 text-sm">
          <strong>问题:</strong> {trace.userMessage}
        </div>
        {trace.finalAnswer && (
          <div className="mt-2 p-3 bg-bg rounded-lg">
            <strong className="text-sm">回答:</strong>
            <p className="mt-1 text-sm whitespace-pre-wrap">{trace.finalAnswer}</p>
          </div>
        )}
      </div>

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
