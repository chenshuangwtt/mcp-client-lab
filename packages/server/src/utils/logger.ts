/**
 * JSON 结构化日志
 *
 * 所有日志以 JSON 格式输出到 stdout，方便采集和分析。
 * 用法: logger.info("事件名", { key: value })
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),
  info:  (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn:  (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
};
