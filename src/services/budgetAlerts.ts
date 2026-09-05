import { BudgetCap } from '../db/types';
import { MongoDBClient } from '../db/mongodb';

export class BudgetAlertService {
  /**
   * Default category spending caps
   */
  static getDefaultCaps(): BudgetCap[] {
    return [
      { category: 'Food & Dining', monthlyLimit: 25000, alertThresholdPct: 80 },
      { category: 'Groceries', monthlyLimit: 40000, alertThresholdPct: 80 },
      { category: 'Entertainment', monthlyLimit: 10000, alertThresholdPct: 75 },
      { category: 'Shopping', monthlyLimit: 20000, alertThresholdPct: 80 }
    ];
  }

  /**
   * Check if any category has exceeded its spending limit, threshold, or burn rate velocity
   */
  static async checkBudgetAlerts(
    db: MongoDBClient,
    categoryBreakdown: Record<string, number>
  ): Promise<string[]> {
    let caps = await db.getBudgetCaps();
    if (!caps || caps.length === 0) {
      caps = this.getDefaultCaps();
    }

    const alerts: string[] = [];
    const now = new Date();
    const currentDay = now.getDate();

    for (const cap of caps) {
      const currentSpent = categoryBreakdown[cap.category] || 0;
      const pctUsed = Math.round((currentSpent / cap.monthlyLimit) * 100);

      if (pctUsed >= 100) {
        alerts.push(
          `🚨 **Budget Exceeded:** You spent ${currentSpent.toLocaleString()} PKR on **${cap.category}** (Limit: ${cap.monthlyLimit.toLocaleString()} PKR)!`
        );
      } else if (pctUsed >= cap.alertThresholdPct) {
        alerts.push(
          `⚠️ **Budget Alert:** You have used ${pctUsed}% of your **${cap.category}** budget (${currentSpent.toLocaleString()} / ${cap.monthlyLimit.toLocaleString()} PKR).`
        );
      } else if (currentDay <= 10 && pctUsed >= 50) {
        alerts.push(
          `⚡ **High Velocity:** It's only Day ${currentDay} of the month and you have already spent ${pctUsed}% of your **${cap.category}** budget.`
        );
      }
    }

    return alerts;
  }

  /**
   * Proactive check before logging a transaction
   */
  static async checkSingleTransactionPacing(
    db: MongoDBClient,
    category: string,
    txAmount: number
  ): Promise<string | null> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const currentSpent = (stats.categoryBreakdown && stats.categoryBreakdown[category]) || 0;
    
    let caps = await db.getBudgetCaps();
    if (!caps || caps.length === 0) {
      caps = this.getDefaultCaps();
    }

    const matchedCap = caps.find(c => c.category.toLowerCase() === category.toLowerCase());
    if (!matchedCap) return null;

    const projectedSpent = currentSpent + txAmount;
    const projectedPct = Math.round((projectedSpent / matchedCap.monthlyLimit) * 100);

    if (projectedPct >= 100) {
      return `⚠️ *This transaction will push your **${matchedCap.category}** spending to ${projectedPct}% of its monthly limit (${projectedSpent.toLocaleString()} / ${matchedCap.monthlyLimit.toLocaleString()} PKR).*`;
    } else if (projectedPct >= matchedCap.alertThresholdPct) {
      return `💡 *Note: You'll be at ${projectedPct}% of your **${matchedCap.category}** monthly budget after this.*`;
    }

    return null;
  }
}
