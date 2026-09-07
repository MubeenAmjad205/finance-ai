import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { Env } from './db/types';
import { MongoDBClient } from './db/mongodb';
import { TelegramBotHandler } from './telegram/bot';
import { TelegramGroupBotHandler } from './telegram/groupBot';
import { ScheduledTaskHandler } from './services/scheduler';
import { renderDashboardHtml } from './ui/dashboard';
import { LoginRateLimiter } from './services/rateLimiter';
import { apiRoutes } from './routes/apiRoutes';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from './utils/timezone';

const app = new Hono<{ Bindings: Env }>();

// Global Error Handler
app.onError((err, c) => {
  console.error('[Hono Error Caught]:', err);
  return c.json({ status: 'error', message: err.message || 'Internal Server Error' }, 500);
});

// Timing-safe comparison to prevent side-channel timing attacks
async function isPasscodeValid(provided: string | undefined, expected: string | undefined): Promise<boolean> {
  if (!expected) return true;
  if (!provided) return false;

  const encoder = new TextEncoder();
  const a = await crypto.subtle.digest('SHA-256', encoder.encode(provided));
  const b = await crypto.subtle.digest('SHA-256', encoder.encode(expected));
  const aArr = new Uint8Array(a);
  const bArr = new Uint8Array(b);

  if (aArr.length !== bArr.length) return false;
  let diff = 0;
  for (let i = 0; i < aArr.length; i++) {
    diff |= aArr[i] ^ bArr[i];
  }
  return diff === 0;
}

// 1. Mount Modular REST API Routes
app.route('/api', apiRoutes);

// 2. Telegram Personal Bot Webhook
app.post('/api/telegram/webhook', async (c) => {
  const handler = new TelegramBotHandler(c.env);
  return await handler.handleWebhook(c.req.raw);
});

// 3. Telegram Group Bot Webhook
app.post('/api/telegram/group-webhook', async (c) => {
  const handler = new TelegramGroupBotHandler(c.env);
  return await handler.handleGroupWebhook(c.req.raw);
});

// 4. Web Dashboard SSR (GET)
app.get('/', async (c) => {
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const lockStatus = LoginRateLimiter.isLockedOut(clientIp);

  if (lockStatus.locked) {
    return c.html(`
      <!DOCTYPE html><html><head><title>Locked Out</title>
      <style>body{background:#0b0f17;color:#fff;font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;margin:0;}
      .card{background:#161f2f;padding:2rem;border-radius:12px;text-align:center;max-width:360px;}</style></head>
      <body><div class="card"><h2>🔒 Access Locked</h2><p style="color:#ef4444;margin-top:1rem;">Too many failed attempts. Try again in 15 minutes.</p></div></body></html>
    `, 429);
  }

  const configuredPasscode = c.env.DASHBOARD_PASSCODE;
  let isAuthenticated = !configuredPasscode;

  if (configuredPasscode) {
    const cookieSession = getCookie(c, 'finance_ai_session');
    const reqPasscode = c.req.query('passcode') || c.req.header('x-passcode');

    if (cookieSession === 'authenticated') {
      isAuthenticated = true;
    } else if (reqPasscode && (await isPasscodeValid(reqPasscode, configuredPasscode))) {
      isAuthenticated = true;
      LoginRateLimiter.recordSuccess(clientIp);
      setCookie(c, 'finance_ai_session', 'authenticated', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 86400 * 30
      });
    }
  }

  if (!isAuthenticated) {
    const errParam = c.req.query('error');
    const remainingAttempts = c.req.query('remaining');
    let errorMessage = '';
    if (errParam === 'invalid_passcode') {
      errorMessage = `<p style="color: #ef4444; font-size: 0.85rem; margin: 0.5rem 0;">❌ Invalid passcode.${remainingAttempts ? ` Attempts remaining: ${remainingAttempts}` : ''}</p>`;
    }

    return c.html(`
      <!DOCTYPE html><html><head><title>Finance AI — Login</title>
      <style>body{background:#0b0f17;color:#fff;font-family:sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;margin:0;}
      .card{background:#161f2f;padding:2rem;border-radius:12px;text-align:center;max-width:360px;width:90%;}
      input{width:100%;box-sizing:border-box;padding:0.75rem;margin:1rem 0;border-radius:8px;border:1px solid #374151;background:#0b0f17;color:#fff;}
      button{width:100%;padding:0.75rem;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-weight:bold;cursor:pointer;}
      </style></head>
      <body><div class="card"><h2>🔒 Finance AI Dashboard</h2><p style="font-size:0.85rem;color:#9ca3af;">Enter passcode to view budget.</p>
      ${errorMessage}
      <form method="POST" action="/"><input type="password" name="passcode" placeholder="Enter Passcode" required autocomplete="current-password" />
      <button type="submit">Access Dashboard</button></form></div></body></html>
    `, 401);
  }

  const db = new MongoDBClient(c.env);
  const userTz = c.env.USER_TIMEZONE || DEFAULT_USER_TIMEZONE;
  const currentMonth = getUserCurrentMonth(userTz);
  const [stats, accounts, persons, recentTransactions] = await Promise.all([
    db.getMonthlyStats(currentMonth),
    db.getAllAccounts(),
    db.getAllPersons(),
    db.getRecentTransactions(20)
  ]);

  const monthName = new Intl.DateTimeFormat('en-US', { timeZone: userTz, month: 'long', year: 'numeric' }).format(new Date());
  const html = renderDashboardHtml(monthName, stats, accounts, persons, recentTransactions);
  return c.html(html);
});

// 5. Web Dashboard Form Login Handler (POST)
app.post('/', async (c) => {
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const lockStatus = LoginRateLimiter.isLockedOut(clientIp);
  if (lockStatus.locked) return c.redirect('/?error=locked_out');

  const configuredPasscode = c.env.DASHBOARD_PASSCODE;
  const body = await c.req.parseBody();
  const provided = String(body['passcode'] || '');

  if (await isPasscodeValid(provided, configuredPasscode)) {
    LoginRateLimiter.recordSuccess(clientIp);
    setCookie(c, 'finance_ai_session', 'authenticated', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 86400 * 30
    });
    return c.redirect('/');
  }

  const failure = LoginRateLimiter.recordFailure(clientIp);
  if (failure.locked) return c.redirect('/?error=locked_out');
  return c.redirect(`/?error=invalid_passcode&remaining=${failure.remainingAttempts}`);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ScheduledTaskHandler.handleScheduled(event, env));
  }
};
