import { MongoDBClient } from '../db/mongodb';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';
import { FinancialHealthService } from './financialHealthService';

export class DigestService {
  /**
   * Generate Daily Morning Glance (8:00 AM)
   */
  static async generateDailyDigest(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<string> {
    const currentMonth = getUserCurrentMonth(userTz);
    const [stats, accounts] = await Promise.all([
      db.getMonthlyStats(currentMonth),
      db.getAllAccounts()
    ]);

    const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const health = await FinancialHealthService.calculateMetrics(db, userTz);

    let digest = `☀️ **Good Morning! Here is your Daily Financial Glance**\n`;
    digest += `──────────────────────\n`;
    digest += `💰 **Total Liquid Capital:** ${totalBalance.toLocaleString()} PKR\n`;
    digest += `💸 **This Month's Spending:** ${stats.totalExpense.toLocaleString()} PKR\n`;
    digest += `🔥 **Daily Spending Pace:** ~${health.dailyBurnRate.toLocaleString()} PKR / day\n`;
    digest += `⏳ **Estimated Runway:** ${health.runwayDays} Days\n\n`;

    if (accounts.length > 0) {
      digest += `🏦 **Account Balances:**\n`;
      for (const a of accounts.slice(0, 4)) {
        digest += `  • ${a.name}: ${a.balance.toLocaleString()} ${a.currency || 'PKR'}\n`;
      }
    }

    digest += `\n💡 *Tip: Log today's purchases as you spend! E.g. "Spent 500 on lunch via JazzCash"*`;
    return digest;
  }

  /**
   * Generate Weekly Spending Recap (Sunday Evening)
   */
  static async generateWeeklyRecap(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<string> {
    const currentMonth = getUserCurrentMonth(userTz);
    const stats = await db.getMonthlyStats(currentMonth);
    const health = await FinancialHealthService.calculateMetrics(db, userTz);

    let recap = `📊 **Weekly Financial Spend Recap**\n`;
    recap += `──────────────────────\n`;
    recap += `💵 **Total Month Income:** ${stats.totalIncome.toLocaleString()} PKR\n`;
    recap += `💸 **Total Month Expenses:** ${stats.totalExpense.toLocaleString()} PKR\n`;
    recap += `📈 **Net Savings:** ${health.netSavings.toLocaleString()} PKR (${health.savingsRate}% Savings Rate)\n\n`;

    if (stats.categoryBreakdown && Object.keys(stats.categoryBreakdown).length > 0) {
      recap += `🏷️ **Top Spending Categories:**\n`;
      const sorted = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
      for (const [cat, amt] of sorted.slice(0, 5)) {
        recap += `  • ${cat}: ${amt.toLocaleString()} PKR\n`;
      }
    }

    recap += `\n🏆 **Financial Health Rating:** ${health.status} (${health.healthScore}/100)`;
    return recap;
  }
}
