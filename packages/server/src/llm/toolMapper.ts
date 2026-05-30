import { MCPToolDef } from "../mcp/types.js";

/** Namespace 后的工具定义（LLM 看到的格式） */
export interface NamespacedTool {
  displayName: string;
  serverName: string;
  rawToolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** 解析结果 */
interface ParsedToolName {
  serverName: string;
  rawToolName: string;
}

/**
 * ToolMapper: 多 Server 工具 namespace 管理
 *
 * 命名规则: displayName = serverName__toolName（双下划线分隔）
 * serverName / toolName 中的非 [a-zA-Z0-9_-] 字符替换为 _
 * 保证 displayName 匹配 OpenAI API 要求的 ^[a-zA-Z0-9_-]+$
 *
 * 示例: server="filesystem", tool="read_file" → "filesystem__read_file"
 */
export class ToolMapper {
  /** serverName → rawToolName → NamespacedTool 的映射 */
  private serverTools = new Map<string, Map<string, NamespacedTool>>();
  /** displayName → { serverName, rawToolName } */
  private displayToParsed = new Map<string, ParsedToolName>();

  /** 注册一个 Server 的工具列表 */
  registerServer(serverName: string, tools: MCPToolDef[]): void {
    // 先清理旧映射
    this.removeServer(serverName);

    const toolMap = new Map<string, NamespacedTool>();

    for (const tool of tools) {
      const safeServer = this.sanitize(serverName);
      const safeTool = this.sanitize(tool.name);
      const displayName = `${safeServer}__${safeTool}`;

      const nsTool: NamespacedTool = {
        displayName,
        serverName,
        rawToolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };

      toolMap.set(tool.name, nsTool);
      this.displayToParsed.set(displayName, {
        serverName,
        rawToolName: tool.name,
      });
    }

    this.serverTools.set(serverName, toolMap);
  }

  /** 移除一个 Server 的所有工具 */
  removeServer(serverName: string): void {
    const toolMap = this.serverTools.get(serverName);
    if (toolMap) {
      for (const nsTool of toolMap.values()) {
        this.displayToParsed.delete(nsTool.displayName);
      }
    }
    this.serverTools.delete(serverName);
  }

  /** 获取所有 namespace 后的工具（含 description 和 inputSchema） */
  getAllTools(): NamespacedTool[] {
    const result: NamespacedTool[] = [];
    for (const toolMap of this.serverTools.values()) {
      for (const tool of toolMap.values()) {
        result.push(tool);
      }
    }
    return result;
  }

  /** 根据 displayName 解析回原始信息 */
  parseDisplayName(displayName: string): ParsedToolName | null {
    return this.displayToParsed.get(displayName) ?? null;
  }

  /** 将字符串中非 [a-zA-Z0-9_-] 的字符替换为 _ */
  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}
