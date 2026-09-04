# ⚡ Finance AI — Personal Budgeting Bot & Dashboard on Cloudflare Workers

> **Minimal, Open-Source, LLM-Powered Personal Finance & Budget Manager running 100% natively on Cloudflare Workers AI.**

---

## 🌟 Key Features

- 🤖 **100% Cloudflare Workers AI**: Powered natively by Cloudflare's free AI models (`@cf/meta/llama-3.1-8b-instruct` for structured financial text parsing and `@cf/meta/llama-3.2-11b-vision-instruct` for receipt screenshots). No external paid LLM API keys needed!
- 📲 **Telegram Bot Interface**: Log transactions effortlessly via natural text (*"Spent 1450 at Tehzeeb via JazzCash"*) or photo screenshots of receipts/bank transfer confirmations.
- 🇵🇰 **Pakistani Payment Services & Bank Support**: Native tracking for JazzCash, EasyPaisa, NayaPay, SadaPay, Meezan Bank, HBL, UBL, Bank Alfalah, Cash, and custom wallets.
- 👥 **Smart Person & Multi-Account Merging**: Auto-resolves counterparties (e.g. "Ali K" vs "Ali Khan"). Uses interactive **Telegram Inline Buttons** for human approval before merging records or balances.
- 🛡️ **Human-in-the-Loop Confirmation**: Nothing is saved silently. The bot presents interactive Telegram UI buttons (`[ ✅ Confirm & Save ]`, `[ 🏦 Switch Account ]`, `[ ❌ Cancel ]`) for every transaction.
- 📊 **Minimal Web Overview Dashboard**: Served directly from Cloudflare Worker (`/`) with a sleek glassmorphic dark-mode design to read monthly stats, spending categories, and person ledgers.
- 🗄️ **MongoDB Atlas Data API**: Uses MongoDB Atlas Data API over standard fetch — zero cold starts, zero socket connection pooling issues.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+ & npm
- A [Cloudflare Account](https://dash.cloudflare.com/) (Free tier)
- A [Telegram Account](https://telegram.org/)
- A [MongoDB Atlas Account](https://www.mongodb.com/cloud/atlas) (Free M0 cluster)

---

### 2. Clone & Install
```bash
git clone https://github.com/MubeenAmjad205/finance-ai.git
cd finance-ai
npm install
```

---

### 3. Create Telegram Bot
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow instructions to get your `TELEGRAM_BOT_TOKEN`.
3. Create a random secret string for `TELEGRAM_SECRET_TOKEN` (e.g. `my_secret_token_123`).

---

### 4. Configure MongoDB Atlas Data API
1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Navigate to **App Services** -> **Data API** and click **Enable Data API**.
3. Generate a **Data API Key** and copy your **App ID** & **Data Source Cluster Name** (`Cluster0`).

---

### 5. Set Environment Secrets in Cloudflare Workers
Run the following commands to configure production secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put MONGODB_DATA_API_KEY
npx wrangler secret put MONGODB_APP_ID
npx wrangler secret put MONGODB_DATABASE
npx wrangler secret put DASHBOARD_PASSCODE
```

Alternatively, for local development, copy `.env.example` to `.dev.vars`:
```bash
cp .env.example .dev.vars
```

---

### 6. Local Development
Run local dev server powered by Wrangler:
```bash
npm run dev
```
Visit `http://localhost:8787` in your browser to test the Web Dashboard UI!

---

### 7. Deploy to Cloudflare Workers
Deploy to Cloudflare's global edge network:
```bash
npm run deploy
```
After deployment, Wrangler will output your worker URL (e.g., `https://finance-ai.<your-subdomain>.workers.dev`).

---

### 8. Register Telegram Webhook
To connect your Telegram bot to your deployed Worker, simply visit:
```
https://finance-ai.<your-subdomain>.workers.dev/api/telegram/setup-webhook
```
Your bot will respond with `{"success": true}` and start receiving messages instantly!

---

## 📱 Telegram Commands Summary

| Command | Description |
| :--- | :--- |
| `/start` | Welcome guide & interactive setup instructions |
| `/summary` | Monthly income vs expense summary & account balance breakdown |
| `/accounts` | List balances across JazzCash, EasyPaisa, Meezan, HBL, Cash |
| `/persons` | List counterparty balances (who owes you / who you owe) |
| `/query <question>` | Ask Cloudflare Workers AI any financial question in natural language |
| `/help` | Detailed command help |

---

## 🛠️ Technology Stack

- **Runtime**: Cloudflare Workers
- **Router**: Hono
- **AI Engine**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`, `@cf/meta/llama-3.2-11b-vision-instruct`)
- **Database**: MongoDB Atlas Data API
- **Fuzzy Matching**: Fuse.js
- **UI Styling**: Vanilla CSS (SSR Glassmorphism)

---

## 📄 License
MIT License. Open Source & free to use!
