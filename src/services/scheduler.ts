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
    const currentDay = new Date().getDate();

    const [stats, accounts] = await Promise.all([
      db.getMonthlyStats(currentMonth),
      db.getAllAccounts()
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
    message += `💎 **Total Assets:** ${totalAssets.toLocaleString()} PKR\n\n`;
    message += `🏦 **Account Balances:**\n${accountsSummary}\n`;

    // 2. Check Upcoming Bills Due
    const upcomingBills = RecurringBillService.getUpcomingBillsDue(currentDay);
    if (upcomingBills.length > 0) {
      message += `📅 **Upcoming Bills Due:**\n`;
      for (const bill of upcomingBills) {
        message += `  • ${bill.title}: **${bill.amount.toLocaleString()} PKR** (Due Day ${bill.dueDayOfMonth})\n`;
      }
      message += `\n`;
    }

    // 3. Check Category Budget Alerts
    const alerts = BudgetAlertService.checkBudgetAlerts(stats.categoryBreakdown);
    if (alerts.length > 0) {
      message += `🚨 **Budget Alerts:**\n`;
      for (const alert of alerts) {
        message += `${alert}\n`;
      }
    }

    // Send Telegram Notification
    await sendTelegramMessage(botToken, Number(chatId), message);
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('[Scheduler Send Exception]:', err);
  }
}
