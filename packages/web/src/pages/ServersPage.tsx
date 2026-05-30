import { useState, useEffect } from "react";
import { api, ServerInfo } from "../api/index.js";

export default function ServersPage() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  function toggleTools(name: string) {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const r = await api.getServers();
      setServers(r.servers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReloadConfig() {
    setReloading(true);
    try {
      const r = await api.reloadServers();
      setServers(r.servers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReloading(false);
    }
  }

  async function handleConnect(name: string) {
    try {
      await api.connectServer(name);
      await load();
    } catch (err) {
      alert(`连接失败: ${err instanceof Error ? err.message : String(err)}`);
      await load();
    }
  }

  async function handleDisconnect(name: string) {
    try {
      await api.disconnectServer(name);
      await load();
    } catch (err) {
      alert(`断开失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRefresh(name: string) {
    try {
      await api.refreshTools(name);
      await load();
    } catch (err) {
      alert(`刷新失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (loading) return <div className="text-center py-8 text-text-dim">加载中...</div>;
  if (error) return <div className="p-4 bg-danger/10 border border-danger rounded-lg text-danger my-4">{error}</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-semibold">MCP Server 管理</h2>
        <button onClick={load} className="px-3 py-1 bg-hover text-text rounded-md text-xs cursor-pointer">
          刷新
        </button>
        <button
          onClick={handleReloadConfig}
          className="px-3 py-1 bg-accent text-white rounded-md text-xs cursor-pointer disabled:opacity-50"
          disabled={reloading}
        >
          {reloading ? "重载中..." : "重载配置"}
        </button>
      </div>

      <div className="mb-6 p-4 bg-card border border-border rounded-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">配置文件模式</h3>
            <p className="mt-1 text-xs text-text-dim">
              编辑项目根目录的 <code className="bg-bg px-1 py-0.5 rounded">mcp-servers.json</code> 后点击重载配置。
            </p>
          </div>
          <div className="text-xs text-text-dim">
            示例在 <code className="bg-bg px-1 py-0.5 rounded">examples/servers/</code>
          </div>
        </div>
      </div>

      {servers.length === 0 && (
        <div className="text-center py-12 text-text-dim">
          mcp-servers.json 还没有配置 MCP Server。
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
        {servers.map((s) => (
          <div key={s.name} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`dot ${s.state}`} />
                <h3 className="text-base font-semibold truncate">{s.name}</h3>
              </div>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${
                  s.state === "connected"
                    ? "bg-success/15 text-success"
                    : s.state === "error"
                    ? "bg-danger/15 text-danger"
                    : s.state === "connecting"
                    ? "bg-warning/15 text-warning"
                    : "bg-hover text-text-dim"
                }`}
              >
                {s.state === "connected" ? "已连接" : s.state === "connecting" ? "连接中" : s.state === "error" ? "错误" : "未连接"}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded text-xs bg-hover text-text-dim">
                {s.transportType}
              </span>
              <span className="text-xs text-text-dim">{s.tools.length} tools</span>
            </div>

            {s.error && (
              <div className="mt-2 p-2 bg-danger/10 rounded-md text-xs text-danger break-words">
                {s.error}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              {s.state !== "connected" ? (
                <button
                  className="px-3 py-1.5 bg-accent text-white rounded-md text-xs cursor-pointer disabled:opacity-50"
                  onClick={() => handleConnect(s.name)}
                  disabled={s.state === "connecting"}
                >
                  {s.state === "connecting" ? "连接中..." : "连接"}
                </button>
              ) : (
                <button
                  className="px-3 py-1.5 bg-danger text-white rounded-md text-xs cursor-pointer"
                  onClick={() => handleDisconnect(s.name)}
                >
                  断开
                </button>
              )}
              <button
                className="px-3 py-1.5 bg-hover text-text rounded-md text-xs cursor-pointer"
                onClick={() => handleRefresh(s.name)}
              >
                刷新工具
              </button>
            </div>

            {s.tools.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => toggleTools(s.name)}
                  className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-2 cursor-pointer hover:text-text flex items-center gap-1"
                >
                  <span className={`inline-block w-0 h-0 border-y-3 border-y-transparent border-l-[6px] border-l-current transition-transform ${expandedTools.has(s.name) ? "rotate-90" : ""}`} />
                  工具列表 ({s.tools.length})
                </button>
                {expandedTools.has(s.name) && (
                  <div className="max-h-48 overflow-y-auto">
                    {s.tools.map((t) => (
                      <div key={t.name} className="py-1.5 border-b border-border last:border-b-0">
                        <div className="font-mono text-sm text-accent">{t.name}</div>
                        <div className="text-xs text-text-dim mt-0.5">{t.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
