import { Hono } from 'hono';
import { Env } from './db/types';
import { MongoDBClient } from './db/mongodb';
import { TelegramBotHandler } from './telegram/bot';
import { TelegramGroupBotHandler } from './telegram/groupBot';
import { ScheduledTaskHandler } from './services/scheduler';
import { renderDashboardHtml } from './ui/dashboard';

const app = new Hono<{ Bindings: Env }>();

// 1. Health Check Endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    app: 'finance-ai',
    runtime: 'Cloudflare Workers AI',
    timestamp: new Date().toISOString()
  });
});

// 2. Telegram Personal Webhook Endpoint
app.post('/api/telegram/webhook', async (c) => {
  const handler = new TelegramBotHandler(c.env);
  return await handler.handleWebhook(c.req.raw);
});

// 3. Telegram Office Group Webhook Endpoint
app.post('/api/telegram/group-webhook', async (c) => {
  const handler = new TelegramGroupBotHandler(c.env);
  return await handler.handleGroupWebhook(c.req.raw);
});

// 3. Optional Telegram Webhook & Commands Registration Helper
app.get('/api/telegram/setup-webhook', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const secretToken = c.env.TELEGRAM_SECRET_TOKEN;
  const host = c.req.header('host');

  if (!token) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN secret is missing.' }, 400);
  }

  const webhookUrl = `https://${host}/api/telegram/webhook`;
  const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}${secretToken ? `&secret_token=${encodeURIComponent(secretToken)}` : ''}`;

  // Register Slash Commands menu with Telegram API
  const commandsUrl = `https://api.telegram.org/bot${token}/setMyCommands`;
  const commandsList = [
    { command: 'summary', description: 'Monthly income, expenses & stats' },
    { command: 'accounts', description: 'View JazzCash, EasyPaisa & bank balances' },
    { command: 'setbalance', description: 'Set starting account balance' },
    { command: 'transfer', description: 'Transfer funds between accounts' },
    { command: 'setlimit', description: 'Set category monthly budget cap' },
    { command: 'paylink', description: 'Generate shareable Raast payment link' },
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

    const data = await webhookRes.json();
    const cmdData = await cmdRes.json();

    return c.json({
      success: true,
      registeredWebhookUrl: webhookUrl,
      telegramResponse: data,
      commandsResponse: cmdData
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Setup Group Telegram Bot Webhook & Commands
app.get('/api/telegram/setup-group-webhook', async (c) => {
  const token = c.env.TELEGRAM_GROUP_BOT_TOKEN || c.env.TELEGRAM_BOT_TOKEN;
  const secretToken = c.env.TELEGRAM_SECRET_TOKEN;
  const host = c.req.header('host');

  if (!token) {
    return c.json({ error: 'TELEGRAM_GROUP_BOT_TOKEN or TELEGRAM_BOT_TOKEN secret is missing.' }, 400);
  }

  const webhookUrl = `https://${host}/api/telegram/group-webhook`;
  const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}${secretToken ? `&secret_token=${encodeURIComponent(secretToken)}` : ''}`;

  const groupCommandsList = [
    { command: 'groupledger', description: 'Net group balance matrix (who owes whom)' },
    { command: 'summary', description: 'Monthly group spending breakdown & leaderboard' },
    { command: 'accounts', description: 'Supported office payment channels' },
    { command: 'paylink', description: 'Generate shareable Raast payment request' },
    { command: 'setlimit', description: 'Set monthly group budget cap' },
    { command: 'goals', description: 'Office team savings goals' },
    { command: 'settle', description: 'Settle debt for a group member' },
    { command: 'undo', description: 'Roll back last logged group expense' },
    { command: 'advisor', description: 'AI tips for saving on office lunches' },
    { command: 'remind', description: 'Send friendly reminder to unpaid members' },
    { command: 'report', description: 'Generate monthly executive group report' },
    { command: 'members', description: 'View list of active group participants' },
    { command: 'query', description: 'Ask AI any question about group expenses' },
    { command: 'grouphelp', description: 'View group bot help & usage guide' }
  ];

  try {
    const [webhookRes, cmdRes] = await Promise.all([
      fetch(setUrl),
      fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: groupCommandsList })
      })
    ]);

    const data = await webhookRes.json();
    const cmdData = await cmdRes.json();

    return c.json({
      success: true,
      registeredGroupWebhookUrl: webhookUrl,
      telegramResponse: data,
      commandsResponse: cmdData
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. JSON Stats API
app.get('/api/stats', async (c) => {
  const db = new MongoDBClient(c.env);
  const currentMonth = new Date().toISOString().substring(0, 7);
  const stats = await db.getMonthlyStats(currentMonth);
  const accounts = await db.getAllAccounts();
  const persons = await db.getAllPersons();

  return c.json({
    month: currentMonth,
    stats,
    accounts,
    persons
  });
});

// 5. Minimal Web Dashboard UI
app.get('/', async (c) => {
  const configuredPasscode = c.env.DASHBOARD_PASSCODE;
  const reqPasscode = c.req.query('passcode') || c.req.header('x-passcode');

  if (configuredPasscode && reqPasscode !== configuredPasscode) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Finance AI — Authentication Required</title>
        <style>
          body { background: #0b0f17; color: #fff; font-family: sans-serif; display: flex; height: 100vh; align-items: center; justify-content: center; }
          .card { background: #161f2f; padding: 2rem; border-radius: 12px; text-align: center; max-width: 360px; }
          input { width: 100%; padding: 0.75rem; margin: 1rem 0; border-radius: 8px; border: 1px solid #374151; background: #0b0f17; color: #fff; }
          button { width: 100%; padding: 0.75rem; border-radius: 8px; border: none; background: #3b82f6; color: #fff; font-weight: bold; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🔒 Finance AI Dashboard</h2>
          <p style="font-size: 0.85rem; color: #9ca3af; margin-top: 0.5rem;">Enter your passcode to view stats.</p>
          <form method="GET">
            <input type="password" name="passcode" placeholder="Enter Passcode" required autocomplete="current-password" />
            <button type="submit">Access Dashboard</button>
          </form>
        </div>
      </body>
      </html>
    `, 401);
  }

  const db = new MongoDBClient(c.env);
  const currentMonth = new Date().toISOString().substring(0, 7);
  
  const [stats, accounts, persons, recentTransactions] = await Promise.all([
    db.getMonthlyStats(currentMonth),
    db.getAllAccounts(),
    db.getAllPersons(),
    db.getRecentTransactions(20)
  ]);

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const html = renderDashboardHtml(monthName, stats, accounts, persons, recentTransactions);

  return c.html(html);
});

// Export Worker handler with both fetch and scheduled cron triggers
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ScheduledTaskHandler.handleScheduled(event, env));
  }
};
