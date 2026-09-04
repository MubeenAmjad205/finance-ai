import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { RecurringBillService } from './recurring';
import { BudgetAlertService } from './budgetAlerts';

export class ScheduledTaskHandler {
  /**
   * Handle Cloudflare Workers scheduled cron trigger
   */
  static async handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log(`[Cloudflare Scheduled Cron Fired]: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`);

    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('[Scheduler Warning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing for cron execution.');
      return;
    }

    const db = new MongoDBClient(env);
    const currentMonth = new Date().toISOString().substring(0, 7);

    const [stats, accounts, reminders] = await Promise.all([
      db.getMonthlyStats(currentMonth),
      db.getAllAccounts(),
      db.getReminders()
    ]);

    // 1. Build Morning Summary
    let totalAssets = 0;
    let accountsSummary = '';
    for (const acc of accounts) {
      totalAssets += acc.balance;
      accountsSummary += `  • ${acc.name}: ${acc.balance.toLocaleString()} PKR\n`;
    }

    let message = `🌅 **Good Morning! Here is your Daily Finance Digest**\n`;
    message += `──────────────────────\n`;
    message += `💎 **Total Liquid Balance:** ${totalAssets.toLocaleString()} PKR\n\n`;
    message += `🏦 **Account Balances:**\n${accountsSummary || '  • No accounts registered.\n'}\n`;

    // 2. Check Upcoming Bills Due (with month-end wrap-around)
    const upcomingBills = RecurringBillService.getUpcomingBillsDue(new Date());
    if (upcomingBills.length > 0) {
      message += `📅 **Upcoming Bills Due:**\n`;
      for (const bill of upcomingBills) {
        message += `  • ${bill.title}: **${bill.amount.toLocaleString()} PKR** (Due Day ${bill.dueDayOfMonth})\n`;
      }
      message += `\n`;
    }

    // 3. Check Pending Reminders
    const pendingReminders = reminders.filter(r => !r.isTriggered);
    if (pendingReminders.length > 0) {
      message += `⏰ **Active Reminders:**\n`;
      for (const r of pendingReminders.slice(0, 3)) {
        message += `  • 📌 ${r.text}\n`;
      }
      message += `\n`;
    }

    // 4. Check Category Budget Alerts from Database
    const alerts = await BudgetAlertService.checkBudgetAlerts(db, stats.categoryBreakdown);
    if (alerts.length > 0) {
      message += `🚨 **Budget Velocity Alerts:**\n`;
      for (const alert of alerts) {
        message += `${alert}\n`;
      }
    }

    // Send Telegram Notification
    await sendTelegramMessage(botToken, chatId, message);
  }
}

async function sendTelegramMessage(botToken: string, chatId: string | number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Scheduler Send Error] Telegram API responded with ${res.status}:`, errText);
    }
  } catch (err) {
    console.error('[Scheduler Send Exception]:', err);
  }
}
