#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GatePayClient } from "./client.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// ============================================================
// 从环境变量读取配置
// ============================================================
const CLIENT_ID = process.env.GATEPAY_CLIENT_ID;
const SECRET_KEY = process.env.GATEPAY_SECRET_KEY;
const AUTH_KEY = process.env.GATEPAY_RESTRICTED_KEY;
const BASE_URL = process.env.GATEPAY_BASE_URL || "https://openplatform.gateapi.io/payment/open/api/mcp";

if (!CLIENT_ID || !SECRET_KEY || !AUTH_KEY) {
  console.error(
    "错误：请设置环境变量 GATEPAY_CLIENT_ID、GATEPAY_SECRET_KEY 和 GATEPAY_RESTRICTED_KEY"
  );
  process.exit(1);
}

const client = new GatePayClient({
  clientId: CLIENT_ID,
  secretKey: SECRET_KEY,
  authKey: AUTH_KEY!,
  baseUrl: BASE_URL,
});

// ============================================================
// MCP Server — 纯代理模式，tools/list 和 tools/call 都转发到远端
// ============================================================
const server = new Server(
  { name: "gatepay-merchant-mcp", version },
  { capabilities: { tools: {} } }
);

// tools/list → 转发到远端获取工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return await client.request("tools/list") as { tools: unknown[] };
});

// tools/call → 转发到远端执行工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await client.request("tools/call", { name, arguments: args }) as { content: unknown[] };
});

// ============================================================
// 启动 stdio 传输
// ============================================================
const transport = new StdioServerTransport();
await server.connect(transport);