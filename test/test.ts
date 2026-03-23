#!/usr/bin/env npx tsx

/**
 * 手动测试脚本 — 连接测试环境验证 tools/list 和 tools/call
 *
 * 使用方式：
 * GATEPAY_CLIENT_ID=xxx GATEPAY_SECRET_KEY=xxx GATEPAY_RESTRICTED_KEY=xxx npx tsx test/test.ts
 */

import { GatePayClient } from "../src/client.js";

// ============================================================
// 配置（从环境变量读取）
// ============================================================
const CLIENT_ID = process.env.GATEPAY_CLIENT_ID;
const SECRET_KEY = process.env.GATEPAY_SECRET_KEY;
const AUTH_KEY = process.env.GATEPAY_RESTRICTED_KEY;
const BASE_URL = process.env.GATEPAY_BASE_URL || "http://dev.halftrust.xyz/payment-service/payment/open/api/mcp";

if (!CLIENT_ID || !SECRET_KEY || !AUTH_KEY) {
  console.error("请设置环境变量 GATEPAY_CLIENT_ID、GATEPAY_SECRET_KEY 和 GATEPAY_RESTRICTED_KEY");
  process.exit(1);
}

const client = new GatePayClient({
  clientId: CLIENT_ID,
  secretKey: SECRET_KEY,
  authKey: AUTH_KEY!,
  baseUrl: BASE_URL,
});

// ============================================================
// 测试用例
// ============================================================
async function run() {
  console.log("========== 测试 tools/list ==========");
  try {
    const listResult = await client.request("tools/list");
    console.log(JSON.stringify(listResult, null, 2));
  } catch (err) {
    console.error("tools/list 失败:", err);
  }

  console.log("\n========== 测试 tools/call: balances_get ==========");
  try {
    const balanceResult = await client.request("tools/call", {
      name: "balances_get",
      arguments: {},
    });
    console.log(JSON.stringify(balanceResult, null, 2));
  } catch (err) {
    console.error("balances_get 失败:", err);
  }
}

run();