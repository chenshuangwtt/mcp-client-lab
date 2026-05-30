import { Routes, Route, NavLink } from "react-router-dom";
import ChatPage from "./pages/ChatPage.js";
import TracePage from "./pages/TracePage.js";
import ServersPage from "./pages/ServersPage.js";
import "./index.css";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center gap-8 px-6 py-3 bg-card border-b border-border">
        <h1 className="text-lg font-semibold text-accent">MCP Client Lab</h1>
        <nav className="flex gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "text-text-dim hover:bg-hover hover:text-text"
              }`
            }
          >
            💬 Chat
          </NavLink>
          <NavLink
            to="/servers"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "text-text-dim hover:bg-hover hover:text-text"
              }`
            }
          >
            🖥 Servers
          </NavLink>
          <NavLink
            to="/traces"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "text-text-dim hover:bg-hover hover:text-text"
              }`
            }
          >
            📋 Traces
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/traces" element={<TracePage />} />
          <Route path="/traces/:traceId" element={<TracePage />} />
        </Routes>
      </main>
    </div>
  );
}
