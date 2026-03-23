#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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
   * 调用 MCP JSON-RPC 接口
   */
  async callTool(toolName, args) {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
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
              // 从标准 MCP 响应中提取 content
              const content = json?.result?.content;
              if (content && content.length > 0) {
                resolve(content[0].text);
              } else if (json?.error) {
                resolve(JSON.stringify({ error: json.error.message }));
              } else {
                resolve(data);
              }
            } catch {
              resolve(data);
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
// MCP Server
// ============================================================
const server = new McpServer({
  name: "gatepay-merchant-mcp",
  version: "1.0.0",
});

// ---- 工具1：查询订单 ----
server.tool(
  "payment_get",
  "根据订单id查询订单详情",
  {
    prepay_id: z.string().optional().describe("订单ID，与 merchant_trade_no 二选一"),
    merchant_trade_no: z.string().optional().describe("商户侧下单唯一id，与 prepay_id 二选一"),
  },
  async ({ prepay_id, merchant_trade_no }) => {
    const text = await client.callTool("payment_get", { prepay_id, merchant_trade_no });
    return { content: [{ type: "text", text }] };
  }
);

// ---- 工具2：查询退款 ----
server.tool(
  "refunds_get",
  "根据退款id查询退款详情",
  {
    refund_request_id: z.string().describe("发起退款时生成的唯一请求退款id"),
  },
  async ({ refund_request_id }) => {
    const text = await client.callTool("refunds_get", { refund_request_id });
    return { content: [{ type: "text", text }] };
  }
);

// ---- 工具3：查询余额 ----
server.tool(
  "balances_get",
  "查询商户账户余额，支持按币种筛选",
  {
    currencies: z.array(z.string()).optional().describe('要查询的币种列表，如 ["USDT","BTC"]'),
  },
  async ({ currencies }) => {
    const text = await client.callTool("balances_get", { currencies });
    return { content: [{ type: "text", text }] };
  }
);

// ---- 工具4：发起退款 ----
const REFUND_CHAIN_CODES = ["DOTSM", "GTEVM", "MATIC", "KAVAEVM", "APT", "ARBEVM", "OPETH", "EOS", "NEAR", "ALGO", "KAIA", "MON", "SOL", "TON", "BSC", "AVAX_C", "XPL", "ETH", "CELO", "TRX", "XTZ"];
server.tool(
  "refunds_create",
  [
    "发起订单退款。使用流程：",
    "1. 先询问用户退款金额（全额还是部分）",
    "2. 询问退款方式：1 原路退，2 指定退",
    "3. 如果指定退，询问渠道：Gate用户(需提供UID) 或 Web3(需提供地址)",
    "4. 如果 Web3 退款，询问手续费承担方：1 商家 2 用户",
  ].join("\n"),
  {
    refundRequestId: z.string().describe("商户退款单号，需唯一"),
    prepayId: z.string().describe("支付单id（平台订单号）"),
    refundAmount: z.string().describe("退款金额字符串"),
    refundStyle: z.number().describe("退款方式：1 原路退，2 指定退，当发起退款时，主动询问用户退款到哪里"),
    refundReason: z.string().optional().describe("退款原因"),
    refundGateId: z.string().optional().describe("退款 gate 侧 id（如有）"),
    refundPayChannel: z.number().optional().describe("退款支付渠道：1 Gate 2 Web3，当refundStyle = 2时指定退时用户必须选择传递"),
    refundToGateUid: z.number().optional().describe("退款至 Gate 用户 uid，当refundPayChannel=1时退款到Gate，用户必须输入uid"),
    refundAddress: z.string().optional().describe("Web3 退款地址，当refundPayChannel=2时，必须用户提供地址"),
    refundChain: z.enum(REFUND_CHAIN_CODES).optional().describe("退款网络，请向用户展示下列选项并只传入其中一项链代码"),
    refundBearType: z.number().optional().describe("承担方：1 商家 2 用户，缺省为 1；退款方式为web3时refundPayChannel=2，需要用户选择费用承担方"),
    memo: z.string().optional().describe("链上 memo"),
    refundAmountTypeFull: z.number().optional().describe("1 全额 2 部分"),
    refundCurrency: z.string().optional().describe("退款币种"),
    refundFundStatementId: z.number().optional().describe("流水 id"),
    refundSource: z.number().optional().describe("退款来源"),
  },
  async (args) => {
    const text = await client.callTool("refunds_create", args);
    return { content: [{ type: "text", text }] };
  }
);

// ============================================================
// 启动 stdio 传输
// ============================================================
const transport = new StdioServerTransport();
await server.connect(transport);
