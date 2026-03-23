import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

export interface GatePayClientConfig {
  clientId: string;
  secretKey: string;
  authKey: string;
  baseUrl: string;
}

export class GatePayClient {
  private clientId: string;
  private secretKey: string;
  private authKey: string;
  private baseUrl: string;

  constructor({ clientId, secretKey, authKey, baseUrl }: GatePayClientConfig) {
    this.clientId = clientId;
    this.secretKey = secretKey;
    this.authKey = authKey;
    this.baseUrl = baseUrl;
  }

  /**
   * HmacSHA512 签名
   * payload = timestamp + '\n' + nonce + '\n' + requestBody + '\n'
   */
  private sign(body: string): { timestamp: string; nonce: string; signature: string } {
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
  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
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
          timeout: 10000,
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
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
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
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout (10s)"));
      });
      req.on("error", (err: Error) => reject(err));
      req.write(body);
      req.end();
    });
  }
}