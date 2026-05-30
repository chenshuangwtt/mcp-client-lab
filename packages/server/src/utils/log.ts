import path from "path";
import fs from "fs";

const logsDir = path.resolve(process.cwd(), "logs");
let globalIndex = 0;

/** 清空所有请求日志 */
export function clearLogs(): void {
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true });
  }
  fs.mkdirSync(logsDir, { recursive: true });
  globalIndex = 0;
}

export enum logType {
  GetTools = "[GET Tools]",
  GetToolsError = "[GET Tools Error]",
  ConnectToServer = "[Connect To Server]",
  LLMRequest = "[LLM Request]",
  LLMResponse = "[LLM Response]",
  LLMError = "[LLM Error]",
  LLMStream = "[LLM Stream]",
  ToolCall = "[Tool Call]",
  ToolCallResponse = "[Tool Call Response]",
  ToolCallError = "[Tool Call Error]",
}

function formatTimestamp(forFileName = false): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const separator = forFileName ? "-" : ":";
  return `${year}-${month}-${day} ${hours}${separator}${minutes}${separator}${seconds}`;
}

function nextRequestLogIndex(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "trace.json").length;
  } catch {
    return 0;
  }
}

/** 为本次请求创建文件夹，返回路径 */
export function createRequestDir(traceId: string): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const dir = path.join(logsDir, `${ts}-${traceId.slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 添加日志到请求文件夹（dir 为空时写到 requests/ 根目录） */
export function addLogs(dir: string, logData: any, logType: logType, round: number = -1) {
  const targetDir = dir || logsDir;
  fs.mkdirSync(targetDir, { recursive: true });

  const seq = dir ? nextRequestLogIndex(targetDir) : globalIndex++;
  const roundTag = round >= 0 ? ` [Round ${round}]` : "";
  const displayName = `[${seq}] ${logType} ${formatTimestamp()}${roundTag}`;
  const fileName = `[${seq}] ${logType} ${formatTimestamp(true)}${roundTag}`;

  console.log(displayName);

  if (logData) {
    fs.writeFileSync(path.join(targetDir, `${fileName}.json`), JSON.stringify(logData, null, 2), "utf8");
  }
}
