import { Hono } from 'hono';
import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';
import { FinancialHealthService } from '../services/financialHealthService';
import { DigestService } from '../services/digestService';
import { SmsParserService } from '../services/smsParser';
import { EmailParserService } from '../services/emailParser';
import { TelegramApiClient } from '../telegram/client/telegramApi';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// 1. Health Check
apiRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
    app: 'finance-ai',
    runtime: 'Cloudflare Workers AI',
    timestamp: new Date().toISOString()
  });
});

// Real-Time Bank SMS Auto-Parser Webhook Endpoint
apiRoutes.post('/sms/webhook', async (c) => {
  try {
    const body: any = await c.req.json();
    const smsSender = body.sender || body.from || 'Bank SMS';
    const smsText = body.body || body.text || body.message || '';

    const parsed = SmsParserService.parseSms(smsSender, smsText);
    if (!parsed) {
      return c.json({ status: 'ignored', message: 'Could not extract valid transaction amount from SMS.' }, 200);
    }

    const db = new MongoDBClient(c.env);
    await db.createTransaction({
      telegramUserId: c.env.TELEGRAM_CHAT_ID ? Number(c.env.TELEGRAM_CHAT_ID) : undefined,
      type: parsed.type,
      amount: parsed.amount,
      currency: 'PKR',
      category: parsed.category,
      account: parsed.account,
      note: parsed.note,
      rawText: smsText,
      confidence: parsed.confidence,
      status: 'confirmed',
      timestamp: new Date().toISOString()
    });

    const delta = parsed.type === 'income' ? parsed.amount : -parsed.amount;
    await db.updateAccountBalance(parsed.account, delta);

    if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
      const msg = `📲 **Bank SMS Alert Auto-Logged!**\n──────────────────────\n💰 **Amount:** ${parsed.amount.toLocaleString()} PKR (${parsed.type.toUpperCase()})\n🏦 **Account:** ${parsed.account}\n🏷️ **Category:** ${parsed.category}\n📝 **Details:** "${parsed.note}"\n\n💾 *Saved to database & account balance updated!*`;
      await TelegramApiClient.sendMessage(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
    }

    return c.json({ status: 'success', parsed });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Real-Time Bank Email Auto-Parser Webhook Endpoint
apiRoutes.post('/email/webhook', async (c) => {
  try {
    const body: any = await c.req.json();
    const from = body.from || 'Bank Email';
    const subject = body.subject || '';
    const emailBody = body.body || body.text || '';

    const parsed = EmailParserService.parseEmail(from, subject, emailBody);
    if (!parsed) {
      return c.json({ status: 'ignored', message: 'Could not extract valid transaction amount from Email.' }, 200);
    }

    const db = new MongoDBClient(c.env);
    await db.createTransaction({
      telegramUserId: c.env.TELEGRAM_CHAT_ID ? Number(c.env.TELEGRAM_CHAT_ID) : undefined,
      type: parsed.type,
      amount: parsed.amount,
      currency: 'PKR',
      category: parsed.category,
      account: parsed.account,
      note: parsed.note,
      rawText: `${subject} ${emailBody}`,
      confidence: parsed.confidence,
      status: 'confirmed',
      timestamp: new Date().toISOString()
    });

    const delta = parsed.type === 'income' ? parsed.amount : -parsed.amount;
    await db.updateAccountBalance(parsed.account, delta);

    if (c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_CHAT_ID) {
      const msg = `✉️ **Bank Email Alert Auto-Logged!**\n──────────────────────\n💰 **Amount:** ${parsed.amount.toLocaleString()} PKR (${parsed.type.toUpperCase()})\n🏦 **Account:** ${parsed.account}\n🏷️ **Category:** ${parsed.category}\n📝 **Details:** "${parsed.note}"\n\n💾 *Saved to database & account balance updated!*`;
      await TelegramApiClient.sendMessage(c.env.TELEGRAM_BOT_TOKEN, c.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
    }

    return c.json({ status: 'success', parsed });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Cron Endpoint for Daily Digest
apiRoutes.get('/cron/daily-digest', async (c) => {
  const db = new MongoDBClient(c.env);
  const digest = await DigestService.generateDailyDigest(db);
  return c.json({ status: 'ok', digest });
});

// Cron Endpoint for Weekly Recap
apiRoutes.get('/cron/weekly-recap', async (c) => {
  const db = new MongoDBClient(c.env);
  const recap = await DigestService.generateWeeklyRecap(db);
  return c.json({ status: 'ok', recap });
});

// 2. Monthly Stats
apiRoutes.get('/stats', async (c) => {
  const db = new MongoDBClient(c.env);
  const currentMonth = getUserCurrentMonth(c.env.USER_TIMEZONE || DEFAULT_USER_TIMEZONE);
  const stats = await db.getMonthlyStats(currentMonth);
  return c.json(stats);
});

// 3. Accounts List
apiRoutes.get('/accounts', async (c) => {
  const db = new MongoDBClient(c.env);
  const accounts = await db.getAllAccounts();
  return c.json(accounts);
});

// 4. Persons List
apiRoutes.get('/persons', async (c) => {
  const db = new MongoDBClient(c.env);
  const persons = await db.getAllPersons();
  return c.json(persons);
});

// 5. Recent Transactions
apiRoutes.get('/transactions', async (c) => {
  const db = new MongoDBClient(c.env);
  const txs = await db.getRecentTransactions(30);
  return c.json(txs);
});

// Printable Statement / PDF Export Endpoint
apiRoutes.get('/export/pdf', async (c) => {
  const db = new MongoDBClient(c.env);
  const currentMonth = getUserCurrentMonth(c.env.USER_TIMEZONE || DEFAULT_USER_TIMEZONE);
  const [stats, txs, accounts] = await Promise.all([
    db.getMonthlyStats(currentMonth),
    db.getRecentTransactions(100),
    db.getAllAccounts()
  ]);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Official Financial Statement — ${currentMonth}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; line-height: 1.5; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
    .title { font-size: 24px; font-weight: bold; color: #1e3a8a; }
    .subtitle { color: #6b7280; font-size: 14px; }
    .summary-box { background: #f3f4f6; border-radius: 8px; padding: 15px; display: flex; justify-content: space-between; margin-bottom: 25px; }
    .stat-item { text-align: center; }
    .stat-val { font-size: 18px; font-weight: bold; color: #1e40af; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; font-size: 12px; }
    th { background: #f9fafb; font-weight: bold; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">📄 FINANCE AI — MONTHLY STATEMENT</div>
    <div class="subtitle">Period: ${currentMonth} • Timezone: Asia/Karachi • Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="summary-box">
    <div class="stat-item"><div>Total Income</div><div class="stat-val" style="color:#16a34a;">${stats.totalIncome.toLocaleString()} PKR</div></div>
    <div class="stat-item"><div>Total Expenses</div><div class="stat-val" style="color:#dc2626;">${stats.totalExpense.toLocaleString()} PKR</div></div>
    <div class="stat-item"><div>Net Savings</div><div class="stat-val" style="color:#2563eb;">${(stats.totalIncome - stats.totalExpense).toLocaleString()} PKR</div></div>
  </div>

  <h3>Transaction History (${txs.length} Records)</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Description</th>
        <th>Category</th>
        <th>Account</th>
        <th>Amount (PKR)</th>
      </tr>
    </thead>
    <tbody>
      ${txs.map(t => `
        <tr>
          <td>${new Date(t.timestamp).toLocaleDateString()}</td>
          <td>${t.type.toUpperCase()}</td>
          <td>${t.note || t.rawText}</td>
          <td>${t.category}</td>
          <td>${t.account}</td>
          <td style="font-weight:bold; color: ${t.type === 'income' ? '#16a34a' : '#111827'}">${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    🔒 Cryptographically Signed Financial Statement • Neon Postgres & Cloudflare Workers AI
  </div>
  <script>window.print();</script>
</body>
</html>`;

  return c.html(html);
});

// 6. JSON Database Backup
apiRoutes.get('/backup', async (c) => {
  const db = new MongoDBClient(c.env);
  const [txs, persons, accounts, budgets, goals] = await Promise.all([
    db.getRecentTransactions(1000),
    db.getAllPersons(),
    db.getAllAccounts(),
    db.getBudgetCaps(),
    db.getGoals()
  ]);

  return c.json({
    timestamp: new Date().toISOString(),
    transactions: txs,
    persons,
    accounts,
    budgets,
    goals
  });
});

// 7. Telegram Webhook Setup Helper
apiRoutes.get('/telegram/setup-webhook', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const secretToken = c.env.TELEGRAM_SECRET_TOKEN;
  const host = c.req.header('host');

  if (!token) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN secret is missing.' }, 400);
  }

  const webhookUrl = `https://${host}/api/telegram/webhook`;
  const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}${secretToken ? `&secret_token=${encodeURIComponent(secretToken)}` : ''}`;

  const commandsUrl = `https://api.telegram.org/bot${token}/setMyCommands`;
  const commandsList = [
    { command: 'runway', description: 'Check financial runway & daily burn rate' },
    { command: 'health', description: 'View financial health scorecard' },
    { command: 'digest', description: 'Generate morning financial glance' },
    { command: 'recap', description: 'Generate weekly spending recap' },
    { command: 'summary', description: 'Monthly income, expenses & stats' },
    { command: 'accounts', description: 'View wallets & bank balances' },
    { command: 'setbalance', description: 'Set starting account balance' },
    { command: 'transfer', description: 'Transfer funds between accounts' },
    { command: 'setlimit', description: 'Set category monthly budget cap' },
    { command: 'paylink', description: 'Generate shareable Raast payment link' },
    { command: 'kameti', description: 'Track rotating savings committees' },
    { command: 'export', description: 'Export monthly CSV financial statement' },
    { command: 'goals', description: 'View & track wealth savings goals' },
    { command: 'settle', description: 'Settle debt with a counterparty' },
    { command: 'undo', description: 'Roll back last confirmed transaction' },
    { command: 'advisor', description: 'Get AI financial advisor tips' },
    { command: 'persons', description: 'Counterparty ledger (who owes what)' },
    { command: 'report', description: 'Generate monthly executive report' },
    { command: 'query', description: 'Ask AI any financial question' },
    { command: 'help', description: 'View bot instructions & command guide' }
  ];

  try {
    const [webhookRes, cmdRes] = await Promise.all([
      fetch(setUrl),
      fetch(commandsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: commandsList })
      })
    ]);

    const webhookResult = await webhookRes.json();
    const cmdResult = await cmdRes.json();

    return c.json({
      webhook: webhookResult,
      commands: cmdResult
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
