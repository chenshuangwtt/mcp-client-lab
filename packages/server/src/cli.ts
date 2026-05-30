/**
 * CLI 模式入口（兼容旧版）
 * 保留原有的命令行交互方式
 */

import { MCPClient } from "./mcpClient.js";
import { validateEnv } from "./utils/config.js";
import { clearLogs } from "./utils/log.js";

function showUsage(): void {
  console.log("=====================================================");
  console.log("MCP Client Lab - CLI 模式");
  console.log("=====================================================");
  console.log("基本用法:");
  console.log("  node build/index.js <服务器脚本路径>");
  console.log("使用配置文件:");
  console.log("  node build/index.js <服务器名称> <配置文件路径>");
  console.log("示例:");
  console.log("  node build/index.js ../mcp-server/build/index.js");
  console.log("  node build/index.js memory ./mcp-servers.json");
  console.log("  node build/index.js default ./mcp-servers.json");
  console.log("=====================================================");
}

export async function main() {
  clearLogs();

  try {
    validateEnv();

    if (process.argv.length < 3) {
      showUsage();
      return;
    }

    const serverIdentifier = process.argv[2];
    const configPath = process.argv.length >= 4 ? process.argv[3] : undefined;

    const mcpClient = new MCPClient();

    try {
      if (configPath) {
        console.log(`正在连接到服务器: ${serverIdentifier} (使用配置文件: ${configPath})`);
      } else {
        console.log(`正在连接到服务器: ${serverIdentifier}`);
      }
      await mcpClient.connectToServer(serverIdentifier, configPath);
      await mcpClient.chatLoop();
    } catch (error) {
      console.error("\n运行MCP客户端时出错:", error);
    } finally {
      await mcpClient.cleanup();
    }
  } catch (error) {
    console.error("初始化MCP客户端失败:", error);
  } finally {
    process.exit(0);
  }
}
