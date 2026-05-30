const BASE = "/api";

const LAB_TOKEN = import.meta.env.VITE_LAB_TOKEN as string | undefined;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(LAB_TOKEN ? { Authorization: `Bearer ${LAB_TOKEN}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ServerInfo {
  name: string;
  transportType: string;
  state: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
}

export interface NamespacedTool {
  displayName: string;
  serverName: string;
  rawToolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TraceData {
  traceId: string;
  userMessage: string;
  finalAnswer?: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  steps: any[];
}

export interface ChatResponse {
  status: "success" | "error" | "need_confirmation";
  traceId: string;
  answer?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  message?: string;
  error?: string;
  toolCalls?: { toolName: string; arguments: Record<string, unknown> }[];
}

export const api = {
  // Servers
  getServers: () => request<{ servers: ServerInfo[] }>("/servers"),
  reloadServers: () => request<{ success: boolean; servers: ServerInfo[] }>("/servers/reload", { method: "POST" }),
  connectServer: (name: string) => request<{ success: boolean; server: ServerInfo }>(`/servers/${name}/connect`, { method: "POST" }),
  disconnectServer: (name: string) => request<{ success: boolean }>(`/servers/${name}/disconnect`, { method: "POST" }),
  refreshTools: (name: string) => request<{ success: boolean; tools: any[] }>(`/servers/${name}/tools/refresh`, { method: "POST" }),

  // Tools
  getTools: () => request<{ tools: NamespacedTool[] }>("/tools"),

  // Chat
  sendMessage: (message: string, confirmTool?: { traceId: string; toolName: string; arguments: Record<string, unknown> }, serverNames?: string[]) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, confirmTool, serverNames }),
    }),
  cancelConfirmation: (traceId: string) =>
    request<{ success: boolean; traceId: string }>("/chat/cancel-confirmation", {
      method: "POST",
      body: JSON.stringify({ traceId }),
    }),

  // Traces
  getTraces: () => request<{ traces: TraceData[] }>("/traces"),
  getTrace: (traceId: string) => request<{ trace: TraceData }>(`/traces/${traceId}`),
  deleteTrace: (traceId: string) => request<{ success: boolean }>(`/traces/${traceId}`, { method: "DELETE" }),
};
