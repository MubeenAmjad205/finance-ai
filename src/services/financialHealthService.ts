import { MongoDBClient } from '../db/mongodb';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';

export interface FinancialHealthMetrics {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  netSavings: number;
  savingsRate: number;
  dailyBurnRate: number;
  runwayDays: number;
  healthScore: number;
  status: 'EXCELLENT' | 'STABLE' | 'WARNING' | 'CRITICAL';
}

export class FinancialHealthService {
  /**
   * Calculate financial health, daily burn rate and runway metrics
   */
  static async calculateMetrics(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<FinancialHealthMetrics> {
    const currentMonth = getUserCurrentMonth(userTz);
    const [stats, accounts] = await Promise.all([
      db.getMonthlyStats(currentMonth),
      db.getAllAccounts()
    ]);

    const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const monthlyIncome = stats.totalIncome || 0;
    const monthlyExpense = stats.totalExpense || 0;
    const netSavings = monthlyIncome - monthlyExpense;

    const savingsRate = monthlyIncome > 0 ? Math.max(0, Math.round((netSavings / monthlyIncome) * 100)) : 0;

    const dayOfMonth = Math.max(1, new Date().getDate());
    const dailyBurnRate = Math.round(monthlyExpense / dayOfMonth);

    const runwayDays = dailyBurnRate > 0 ? Math.round(totalBalance / dailyBurnRate) : 999;

    let healthScore = 70;
    if (savingsRate >= 30) healthScore += 15;
    else if (savingsRate < 10) healthScore -= 15;

    if (runwayDays >= 60) healthScore += 15;
    else if (runwayDays < 15) healthScore -= 25;

    healthScore = Math.min(100, Math.max(0, healthScore));

    let status: 'EXCELLENT' | 'STABLE' | 'WARNING' | 'CRITICAL' = 'STABLE';
    if (healthScore >= 85) status = 'EXCELLENT';
    else if (healthScore >= 65) status = 'STABLE';
    else if (healthScore >= 45) status = 'WARNING';
    else status = 'CRITICAL';

    return {
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      netSavings,
      savingsRate,
      dailyBurnRate,
      runwayDays,
      healthScore,
      status
    };
  }

  /**
   * Render clean Telegram markdown report for /runway command
   */
  static async generateRunwayReport(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<string> {
    const m = await this.calculateMetrics(db, userTz);

    let report = `⏳ **Financial Runway & Burn Rate Analysis**\n`;
    report += `──────────────────────\n`;
    report += `💰 **Total Liquid Capital:** ${m.totalBalance.toLocaleString()} PKR\n`;
    report += `🔥 **Daily Spending Pace:** ~${m.dailyBurnRate.toLocaleString()} PKR / day\n`;
    report += `🗓️ **Estimated Runway:** \`${m.runwayDays > 365 ? '365+ Days' : m.runwayDays + ' Days'}\`\n\n`;

    if (m.runwayDays < 15) {
      report += `🚨 *CRITICAL WARNING: Your current daily spend will exhaust liquid funds in under 15 days! Consider cutting non-essential expenses immediately.*`;
    } else if (m.runwayDays < 30) {
      report += `⚠️ *MODERATE WARNING: Runway is under 30 days. Maintain conservative spending until next income influx.*`;
    } else {
      report += `✅ *HEALTHY RUNWAY: You have adequate liquid buffers to sustain current living expenses.*`;
    }

    return report;
  }

  /**
   * Render clean Telegram markdown report for /health command
   */
  static async generateHealthScorecard(db: MongoDBClient, userTz = DEFAULT_USER_TIMEZONE): Promise<string> {
    const m = await this.calculateMetrics(db, userTz);

    const statusBadge = m.status === 'EXCELLENT' ? '🟢 EXCELLENT' : m.status === 'STABLE' ? '🔵 STABLE' : m.status === 'WARNING' ? '🟡 WARNING' : '🔴 CRITICAL';

    let card = `📊 **Financial Health Scorecard**\n`;
    card += `──────────────────────\n`;
    card += `🏆 **Health Score:** \`${m.healthScore} / 100\` (${statusBadge})\n\n`;
    card += `💵 **Monthly Income:** ${m.monthlyIncome.toLocaleString()} PKR\n`;
    card += `💸 **Monthly Expenses:** ${m.monthlyExpense.toLocaleString()} PKR\n`;
    card += `📈 **Net Savings:** ${m.netSavings.toLocaleString()} PKR (${m.savingsRate}% Savings Rate)\n`;
    card += `⏳ **Liquidity Runway:** ${m.runwayDays > 365 ? '365+ Days' : m.runwayDays + ' Days'}\n\n`;

    card += `💡 **Recommendations:**\n`;
    if (m.savingsRate < 20) {
      card += `• Aim to save at least 20% of monthly income into a high-yield account.\n`;
    } else {
      card += `• Strong savings rate! Allocate surplus towards long-term investment goals.\n`;
    }
    if (m.totalBalance < m.monthlyExpense * 3) {
      card += `• Build an emergency fund covering 3 to 6 months of expenses (~${(m.monthlyExpense * 3).toLocaleString()} PKR).\n`;
    }

    return card;
  }
}
