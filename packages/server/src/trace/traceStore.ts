import fs from "fs/promises";
import path from "path";
import { Trace } from "./traceTypes.js";

const REQUESTS_DIR = path.resolve(process.cwd(), "logs");

async function ensureDir(): Promise<void> {
  try { await fs.mkdir(REQUESTS_DIR, { recursive: true }); } catch {}
}

/** 保存 trace 到指定请求文件夹 */
export async function saveTrace(trace: Trace, dir?: string): Promise<void> {
  if (dir) {
    await fs.writeFile(path.join(dir, "trace.json"), JSON.stringify(trace, null, 2), "utf8");
  }
}

/** 从 requests/ 列出所有 trace */
export async function listTraces(limit = 50): Promise<Trace[]> {
  await ensureDir();
  const dirs = await fs.readdir(REQUESTS_DIR);
  const folders = dirs.filter((d) => d.includes("-")).sort().reverse().slice(0, limit);
  const traces: Trace[] = [];
  for (const folder of folders) {
    try {
      const raw = await fs.readFile(path.join(REQUESTS_DIR, folder, "trace.json"), "utf8");
      traces.push(JSON.parse(raw));
    } catch { /* skip */ }
  }
  return traces;
}

/** 根据 traceId 查找并加载 trace */
export async function loadTrace(traceId: string): Promise<Trace | null> {
  await ensureDir();
  const dirs = await fs.readdir(REQUESTS_DIR);
  for (const folder of dirs) {
    try {
      const raw = await fs.readFile(path.join(REQUESTS_DIR, folder, "trace.json"), "utf8");
      const trace: Trace = JSON.parse(raw);
      if (trace.traceId === traceId) return trace;
    } catch { /* skip */ }
  }
  return null;
}

/** 删除包含指定 traceId 的请求文件夹 */
export async function deleteTrace(traceId: string): Promise<boolean> {
  await ensureDir();
  const dirs = await fs.readdir(REQUESTS_DIR);
  for (const folder of dirs) {
    try {
      const raw = await fs.readFile(path.join(REQUESTS_DIR, folder, "trace.json"), "utf8");
      const trace: Trace = JSON.parse(raw);
      if (trace.traceId === traceId) {
        await fs.rm(path.join(REQUESTS_DIR, folder), { recursive: true });
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}
