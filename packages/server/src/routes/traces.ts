import { Router } from "express";
import { listTraces, loadTrace, deleteTrace } from "../trace/traceStore.js";

export function createTracesRouter(): Router {
  const router = Router();

  // GET /api/traces — 历史 trace 列表
  router.get("/", async (_req, res) => {
    try {
      const traces = await listTraces();
      res.json({ traces });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/traces/:traceId — 某次完整 trace
  router.get("/:traceId", async (req, res) => {
    try {
      const trace = await loadTrace(req.params.traceId);
      if (!trace) {
        res.status(404).json({ error: "Trace 不存在" });
        return;
      }
      res.json({ trace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /api/traces/:traceId — 删除指定 trace
  router.delete("/:traceId", async (req, res) => {
    try {
      const ok = await deleteTrace(req.params.traceId);
      if (!ok) {
        res.status(404).json({ error: "Trace 不存在" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
