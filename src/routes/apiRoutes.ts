import { Hono } from 'hono';
import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';

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
