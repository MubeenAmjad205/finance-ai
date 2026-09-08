# ⚡ Finance AI — Personal Budgeting Bot & Dashboard on Cloudflare Workers

> **Minimal, Open-Source, LLM-Powered Personal Finance & Budget Manager running 100% natively on Cloudflare Workers AI.**

---

## 🌟 Key Features

- 🤖 **100% Cloudflare Workers AI**: Powered natively by Cloudflare's free AI models (`@cf/meta/llama-3.1-8b-instruct` for text parsing, `@cf/meta/llama-3.2-11b-vision-instruct` for receipt screenshots, and `@cf/openai/whisper` for voice notes).
- 🎙️ **Urdu & English Voice Notes**: Send voice messages directly in Telegram chat (*"Bhai JazzCash se 2500 PKR petrol ke liye diye"*), and Workers AI Whisper transcribes and structures the transaction automatically!
- 🤝 **Splitwise-Style Group Bill Splitting**: Split shared group expenses (*"Paid 6000 for dinner with Ali, Usman, Bilal - split 4 ways"*) and auto-update individual ledgers.
- 📄 **PDF Bank Statement Bulk Import**: Upload Meezan, HBL, JazzCash, or EasyPaisa PDF statements to auto-extract transaction rows with Workers AI.
- 💱 **Multi-Currency Conversion**: Automatic exchange rate conversion for USD, EUR, GBP, AED, SAR into PKR for freelancers and international transfers.
- 🇵🇰 **Pakistani Payment Services & Bank Support**: Native tracking for JazzCash, EasyPaisa, NayaPay, SadaPay, Meezan Bank, HBL, UBL, Bank Alfalah, Cash, and custom wallets.
- 👥 **Smart Person & Multi-Account Merging**: Auto-resolves counterparties (e.g. "Ali K" vs "Ali Khan"). Uses interactive **Telegram Inline Buttons** for human approval before merging records or balances.
- ⏰ **Automated Daily Digest Crons**: Cloudflare Worker scheduled triggers send daily morning balance pings (8:00 AM PKT) and bill due warnings to Telegram.
- 📱 **Telegram Mini App (TWA) & React Dashboard**: Built with React 18, Vite, Lucide icons, and Telegram WebApp SDK (`frontend/`). Includes CSV export, category breakdown, and person ledgers.
- 🗄️ **Neon Postgres**: Serverless PostgreSQL database using `@neondatabase/serverless` — zero cold starts, ultra-fast HTTP SQL query execution natively on Cloudflare Workers.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+ & npm
- A [Cloudflare Account](https://dash.cloudflare.com/) (Free tier)
- A [Telegram Account](https://telegram.org/)
- A [Neon Postgres Account](https://neon.tech/) (Free tier)

---

### 2. Clone & Install
```bash
git clone https://github.com/MubeenAmjad205/finance-ai.git
cd finance-ai
npm install
cd frontend && npm install && npm run build && cd ..
```

---

### 3. Create Telegram Bot
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow instructions to get your `TELEGRAM_BOT_TOKEN`.
3. Create a random secret string for `TELEGRAM_SECRET_TOKEN` (e.g. `my_secret_token_123`).
4. Copy your Telegram Chat ID for `TELEGRAM_CHAT_ID` (for automated morning digests).

---

### 4. Configure Neon Postgres
1. Log in to [Neon Console](https://console.neon.tech/).
2. Create a project and database (`neondb`).
3. Copy your connection string `DATABASE_URL` (`postgresql://user:pass@ep-xyz.eastus2.azure.neon.tech/neondb?sslmode=require`).

---

### 5. Set Environment Secrets in Cloudflare Workers
Run the following commands to configure production secrets:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put DATABASE_URL
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
- **AI Models**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`, `@cf/meta/llama-3.2-11b-vision-instruct`, `@cf/openai/whisper`)
- **Frontend**: React 18 + Vite + Telegram Mini App SDK (`frontend/`)
- **Database**: Neon Postgres (`@neondatabase/serverless`)
- **Fuzzy Matching**: Fuse.js

---

## 📄 License
MIT License. Open Source & free to use!
