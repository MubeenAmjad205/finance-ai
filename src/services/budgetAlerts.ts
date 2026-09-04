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
   * Check if any category has exceeded its spending limit or threshold
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

    for (const cap of caps) {
      const currentSpent = categoryBreakdown[cap.category] || 0;
      const pctUsed = Math.round((currentSpent / cap.monthlyLimit) * 100);

      if (pctUsed >= 100) {
        alerts.push(
          `🚨 **Budget Exceeded:** You spent ${currentSpent.toLocaleString()} PKR on **${cap.category}** (Limit: ${cap.monthlyLimit.toLocaleString()} PKR)!`
        );
      } else if (pctUsed >= cap.alertThresholdPct) {
        alerts.push(
          `⚠️ **Warning:** You have used ${pctUsed}% of your **${cap.category}** budget (${currentSpent.toLocaleString()} / ${cap.monthlyLimit.toLocaleString()} PKR).`
        );
      }
    }

    return alerts;
  }
}
