/**
 * 全局类型声明文件
 * 为缺少类型定义的模块提供声明
 */

// 为 @modelcontextprotocol/sdk 提供类型声明
declare module "@modelcontextprotocol/sdk/client/index.js" {
  export class Client {
    constructor(options: { name: string; version: string });
    connect(transport: any): void;
    listTools(): Promise<{ tools: Array<{ name: string; description: string; inputSchema: any }> }>;
    callTool(params: { name: string; arguments: any }): Promise<{ content: string; [key: string]: any }>;
    close(): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/client/stdio.js" {
  export class StdioClientTransport {
    constructor(options: { command: string; args: string[] });
  }
}

// 为 readline/promises 提供类型声明
declare module "readline/promises" {
  import { ReadStream, WriteStream } from "fs";
  
  interface Interface {
    question(query: string): Promise<string>;
    close(): void;
  }
  
  export function createInterface(options: {
    input: ReadStream;
    output: WriteStream;
  }): Interface;
}

// 为 dotenv 提供类型声明
declare module "dotenv" {
  export function config(): void;
}
