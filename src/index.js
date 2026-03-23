#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

// ============================================================
// GatePay API 客户端 — 内置签名逻辑，用户无需关心
// ============================================================
class GatePayClient {
  constructor({ clientId, secretKey, authKey, baseUrl }) {
    this.clientId = clientId;
    this.secretKey = secretKey;
    this.authKey = authKey;
    this.baseUrl = baseUrl;
  }

  /**
   * HmacSHA512 签名
   * payload = timestamp + '\n' + nonce + '\n' + requestBody + '\n'
   */
  sign(body) {
    const timestamp = Date.now().toString();
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const payload = `${timestamp}\n${nonce}\n${body}\n`;
    const signature = crypto
      .createHmac("sha512", this.secretKey)
      .update(payload)
      .digest("hex");
    return { timestamp, nonce, signature };
  }

  /**
   * 调用远端 MCP JSON-RPC 接口（通用方法）
   */
  async request(method, params = {}) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    });

    const { timestamp, nonce, signature } = this.sign(body);
    const url = new URL(this.baseUrl);
    const mod = url.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const req = mod.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GatePay-Certificate-ClientId": this.clientId,
            "X-GatePay-Restricted-Key": this.authKey,
            "X-GatePay-Timestamp": timestamp,
            "X-GatePay-Nonce": nonce,
            "X-GatePay-Signature": signature,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (json?.error) {
                reject(new Error(json.error.message));
              } else {
                resolve(json?.result);
              }
            } catch {
              reject(new Error(`Invalid response: ${data}`));
            }
          });
        }
      );
      req.on("error", (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}

// ============================================================
// 从环境变量读取配置
// ============================================================
const CLIENT_ID = process.env.GATEPAY_CLIENT_ID;
const SECRET_KEY = process.env.GATEPAY_SECRET_KEY;
const AUTH_KEY = process.env.GATEPAY_RESTRICTED_KEY;
const BASE_URL = process.env.GATEPAY_BASE_URL || "https://openplatform.gateapi.io/payment/open/api/mcp";

if (!CLIENT_ID || !SECRET_KEY) {
  console.error(
    "错误：请设置环境变量 GATEPAY_CLIENT_ID 和 GATEPAY_SECRET_KEY"
  );
  process.exit(1);
}

const client = new GatePayClient({
  clientId: CLIENT_ID,
  secretKey: SECRET_KEY,
  authKey: AUTH_KEY,
  baseUrl: BASE_URL,
});

// ============================================================
// MCP Server — 纯代理模式，tools/list 和 tools/call 都转发到远端
// ============================================================
const server = new Server(
  { name: "gatepay-merchant-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// tools/list → 转发到远端获取工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return await client.request("tools/list");
});

// tools/call → 转发到远端执行工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await client.request("tools/call", { name, arguments: args });
});

// ============================================================
// 启动 stdio 传输
// ============================================================
const transport = new StdioServerTransport();
await server.connect(transport);