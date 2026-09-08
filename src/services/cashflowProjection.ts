import { MongoDBClient } from '../db/mongodb';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';
import { FinancialHealthService } from './financialHealthService';

export class CashflowProjectionService {
  /**
   * Calculate Cash Flow Projection & Pre-Payday Dry Spell Warnings
   */
  static async calculateProjection(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<{
    currentBalance: number;
    dailyBurn: number;
    daysUntilPayday: number;
    projectedBalanceAtPayday: number;
    drySpellRisk: boolean;
    suggestedDailyCap: number;
    nextPaydayDate: string;
  }> {
    const health = await FinancialHealthService.calculateMetrics(db, userTz);
    const now = new Date();
    const currentDay = now.getDate();

    // Default salary payday is 1st of next month
    const nextPayday = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysUntilPayday = Math.max(1, Math.ceil((nextPayday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const projectedBalanceAtPayday = health.totalBalance - (health.dailyBurnRate * daysUntilPayday);
    const drySpellRisk = projectedBalanceAtPayday < 0;

    const suggestedDailyCap = daysUntilPayday > 0 ? Math.max(0, Math.floor(health.totalBalance / daysUntilPayday)) : 0;
    const nextPaydayDate = nextPayday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return {
      currentBalance: health.totalBalance,
      dailyBurn: health.dailyBurnRate,
      daysUntilPayday,
      projectedBalanceAtPayday,
      drySpellRisk,
      suggestedDailyCap,
      nextPaydayDate
    };
  }

  /**
   * Render clean Markdown Report for /projection command
   */
  static async generateProjectionReport(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<string> {
    const p = await this.calculateProjection(db, userTz);

    let report = `📉 **Cash Flow Projection & Pre-Payday Predictor**\n`;
    report += `──────────────────────\n`;
    report += `💰 **Current Liquid Balance:** ${p.currentBalance.toLocaleString()} PKR\n`;
    report += `🔥 **Current Daily Pace:** ~${p.dailyBurn.toLocaleString()} PKR / day\n`;
    report += `🗓️ **Days Until Next Payday (${p.nextPaydayDate}):** \`${p.daysUntilPayday} Days\`\n`;
    report += `🔮 **Projected Balance on Payday:** \`${p.projectedBalanceAtPayday.toLocaleString()} PKR\`\n\n`;

    if (p.drySpellRisk) {
      report += `🚨 **PRE-PAYDAY DRY SPELL ALERT!**\n`;
      report += `At your current burn rate, your funds will reach 0 PKR **${Math.abs(Math.floor(p.projectedBalanceAtPayday / (p.dailyBurn || 1)))} days before payday**!\n\n`;
      report += `💡 **Recommended Daily Spending Cap:** \`${p.suggestedDailyCap.toLocaleString()} PKR / day\` to reach payday safely.`;
    } else {
      report += `✅ **HEALTHY CASH FLOW:** You are on track to reach payday with a surplus buffer of ~${p.projectedBalanceAtPayday.toLocaleString()} PKR!\n`;
      report += `💡 *Suggested Daily Limit:* \`${p.suggestedDailyCap.toLocaleString()} PKR / day\``;
    }

    return report;
  }
}
