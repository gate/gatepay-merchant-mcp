# gatepay-merchant-mcp

GatePay Merchant MCP Server — A Model Context Protocol server for GatePay payment system.

## Features

- **Query Order** (`payment_get`) — Query order details by `prepay_id` or `merchant_trade_no`
- **Query Refund** (`refunds_get`) — Query refund details by `refund_request_id`
- **Query Balance** (`balances_get`) — Query merchant account balances, with optional currency filter
- **Create Refund** (`refunds_create`) — Initiate a refund with support for:
  - Full or partial refund
  - Original path refund or designated refund
  - Designated refund to Gate user (by UID) or Web3 address
  - Configurable fee bearer (merchant or user)

## Quick Start

Add the following to your MCP client configuration:

```json
{
  "mcpServers": {
    "gatepay-merchant": {
      "command": "npx",
      "args": ["-y", "gatepay-payment-mcp@latest"],
      "env": {
        "GATEPAY_CLIENT_ID": "<your-client-id>",
        "GATEPAY_SECRET_KEY": "<your-secret-key>",
        "GATEPAY_RESTRICTED_KEY": "<your-restricted-key>"
      }
    }
  }
}
```
Put this into your MCP config such as ~/.cursor/mcp.json, then restart the client or reload MCP.


## Environment Variables

| Environment Variable | Required | Description |
| --- | --- | --- |
| `GATEPAY_CLIENT_ID` | Yes | Your GatePay merchant client ID |
| `GATEPAY_SECRET_KEY` | Yes | Your GatePay API secret key for signing |
| `GATEPAY_RESTRICTED_KEY` | Yes | Your GatePay restricted auth key |
| `GATEPAY_BASE_URL` | No | API endpoint (default: `https://openplatform.gateapi.io/payment/open/api/mcp`) |

## Development

```bash
# install dependencies
npm install

# build TypeScript output into dist/
npm run build

# run the built entrypoint
npm start

# run integration test against test environment
npm test

```

## License
MIT