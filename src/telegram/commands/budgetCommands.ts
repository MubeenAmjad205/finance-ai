import { MongoDBClient } from '../../db/mongodb';

export class BudgetCommands {
  /**
   * Handle setting monthly category budget cap with REAL database persistence
   */
  static async handleSetLimit(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return `⚠️ **Usage:** \`/setlimit <Category> <MonthlyLimitAmount>\`\n\n*Examples:*\n• \`/setlimit Food 20000\`\n• \`/setlimit Groceries 35000\`\n• \`/setlimit Entertainment 10000\``;
    }

    const limitStr = parts[parts.length - 1];
    const category = parts.slice(0, parts.length - 1).join(' ');
    const limitAmount = parseFloat(limitStr.replace(/,/g, ''));

    if (isNaN(limitAmount) || limitAmount <= 0) {
      return `❌ Invalid limit amount: "${limitStr}". Please enter a valid positive number.`;
    }

    // Persist real budget cap in MongoDB repository
    await db.setBudgetCap(category, limitAmount, 80);

    return `🎯 **Category Budget Cap Saved!**\n──────────────────────\n🏷️ **Category:** ${category}\n🛑 **Monthly Limit:** ${this.formatCurrency(limitAmount)}\n\n*You will receive velocity warning alerts if your spending exceeds 80% of this limit.*`;
  }

  /**
   * Handle savings and wealth goals with REAL database persistence
   */
  static async handleGoals(db: MongoDBClient, args?: string): Promise<string> {
    const parts = (args || '').trim().split(/\s+/);

    // Optional set syntax: /goals set <Title> <Amount>
    if (parts.length >= 3 && parts[0].toLowerCase() === 'set') {
      const targetStr = parts[parts.length - 1];
      const title = parts.slice(1, parts.length - 1).join(' ');
      const targetAmount = parseFloat(targetStr.replace(/,/g, ''));

      if (!isNaN(targetAmount) && targetAmount > 0) {
        await db.setGoal(title, targetAmount);
        return `🏆 **New Savings Goal Created!**\n──────────────────────\n📌 **Goal:** ${title}\n🎯 **Target:** ${this.formatCurrency(targetAmount)}\n\n*Use \`/goals\` anytime to view your progress.*`;
      }
    }

    // Fetch active goals from database repository
    const goals = await db.getGoals();

    let text = `🎯 **Savings & Wealth Goals Tracker**\n──────────────────────\n`;
    for (const g of goals) {
      const pct = g.targetAmount > 0 ? Math.min(Math.round((g.currentAmount / g.targetAmount) * 100), 100) : 0;
      text += `🏆 **${g.title}**\n`;
      text += `  • Progress: **${this.formatCurrency(g.currentAmount)}** / ${this.formatCurrency(g.targetAmount)} (${pct}%)\n\n`;
    }

    text += `💡 *To set a new goal, use:* \`/goals set <Title> <Amount>\`\n*Example:* \`/goals set Emergency Fund 100000\``;
    return text;
  }

  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
  }
}
