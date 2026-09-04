import { Env } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';
import { AIService } from '../../services/ai';

export class UtilityCommands {
  static async handleStart(env: Env): Promise<string> {
    return `👋 **Welcome to your AI Personal Finance Manager!**

I am your personal budget assistant running natively on **Cloudflare Workers AI**.

💡 **How to use me:**
1️⃣ **Log Expenses/Income:** Just type naturally or tap quick buttons below!
   • *"Spent 1450 at Tehzeeb via JazzCash"*
   • *"Received 5000 from Ali Khan on EasyPaisa"*
   • *"Sent 2000 to Usman via Meezan Bank"*
2️⃣ **Send Voice Notes & Receipts:** Record audio or upload payment screenshots!
3️⃣ **Interactive Confirmation:** I will always ask for your confirmation before saving anything!

📋 **Commands Directory:**
• \`/summary\` - View monthly stats & spending breakdown
• \`/accounts\` - View JazzCash, EasyPaisa, Bank & Cash balances
• \`/setbalance <Account> <Amount>\` - Set exact starting balance
• \`/transfer <From> <To> <Amount>\` - Transfer between accounts
• \`/setlimit <Category> <Amount>\` - Set monthly category budget cap
• \`/paylink <Person>\` - Generate shareable Raast payment request link
• \`/goals\` - View & track savings goals
• \`/settle <Person> [Amount]\` - Settle debt with a counterparty
• \`/undo\` - Roll back last confirmed transaction
• \`/advisor\` - Get AI financial advisor wealth & savings tips
• \`/remind <Text>\` - Set custom financial reminder
• \`/persons\` - View counterparties & who owes what
• \`/report\` - Generate formatted executive monthly report
• \`/query <question>\` - Ask AI any financial question
• \`/help\` - View this help guide`;
  }

  static async handleSummary(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();

    const netSavings = stats.totalIncome - stats.totalExpense;

    let text = `📊 **Financial Summary for ${this.getFormattedMonthName(currentMonth)}**\n`;
    text += `──────────────────────\n`;
    text += `💵 **Total Income:** ${this.formatCurrency(stats.totalIncome)}\n`;
    text += `💸 **Total Expenses:** ${this.formatCurrency(stats.totalExpense)}\n`;
    text += `📈 **Net Position:** ${netSavings >= 0 ? '🟢 +' : '🔴 '}${this.formatCurrency(netSavings)}\n\n`;

    text += `🏷️ **Top Categories:**\n`;
    const catEntries = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
    if (catEntries.length === 0) {
      text += `  • No expense records this month yet.\n`;
    } else {
      for (const [cat, amt] of catEntries) {
        text += `  • ${this.getCategoryEmoji(cat)} **${cat}:** ${this.formatCurrency(amt)}\n`;
      }
    }

    text += `\n🏦 **Account Balances:**\n`;
    for (const acc of accounts) {
      text += `  • ${this.getAccountEmoji(acc.name)} **${acc.name}:** ${this.formatCurrency(acc.balance)}\n`;
    }

    return text;
  }

  static async handleUndo(db: MongoDBClient): Promise<string> {
    const lastTx = await db.getLastConfirmedTransaction();
    if (!lastTx || !lastTx._id) {
      return `ℹ️ No recent confirmed transaction found to undo.`;
    }

    if (lastTx.status !== 'confirmed') {
      return `ℹ️ The last recorded transaction is already marked as ${lastTx.status}.`;
    }

    // 1. Mark transaction as rejected / undone
    await db.updateTransaction(lastTx._id, { status: 'rejected' });

    // 2. Reverse account balance
    const balanceDelta = lastTx.type === 'income' || lastTx.type === 'debt_received' ? -lastTx.amount : lastTx.amount;
    await db.updateAccountBalance(lastTx.account, balanceDelta);

    // 3. Reverse person balance if linked
    if (lastTx.personId) {
      const personDelta = lastTx.type === 'debt_given' || lastTx.type === 'expense' ? -lastTx.amount : lastTx.amount;
      await db.updatePersonBalance(lastTx.personId, personDelta);
    }

    return `↩️ **Transaction Rolled Back & Undone!**\n──────────────────────\n💰 **Amount Reverted:** ${this.formatCurrency(lastTx.amount)}\n🏦 **Account Restored:** ${lastTx.account}\n📝 **Note:** ${lastTx.note}`;
  }

  static async handleAdvisor(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();

    return await AIService.generateFinancialAdvisorTips(env, stats, accounts);
  }

  static async handleRemind(db: MongoDBClient, args: string, chatId?: string | number): Promise<string> {
    if (!args || args.trim().length === 0) {
      return `⚠️ **Usage:** \`/remind <Reminder Text>\`\n\n*Examples:*\n• \`/remind Pay K-Electric bill on 5th September\`\n• \`/remind Collect 5000 PKR dinner split from Ali\``;
    }

    // Persist real reminder in database repository
    await db.addReminder(args.trim(), chatId);

    return `⏰ **Reminder Saved to Database!**\n──────────────────────\n📌 **Note:** ${args}\n🔔 You will receive this alert in your daily morning digest.`;
  }

  static async handleReport(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();
    const persons = await db.getAllPersons();

    const netSavings = stats.totalIncome - stats.totalExpense;

    let report = `📑 **EXECUTIVE FINANCIAL REPORT — ${this.getFormattedMonthName(currentMonth)}**\n`;
    report += `==================================\n\n`;
    report += `💵 **Income:** ${this.formatCurrency(stats.totalIncome)}\n`;
    report += `💸 **Expenses:** ${this.formatCurrency(stats.totalExpense)}\n`;
    report += `📈 **Net Position:** ${netSavings >= 0 ? '+' : ''}${this.formatCurrency(netSavings)}\n\n`;

    report += `🏦 **ACCOUNT BALANCES:**\n`;
    let totalAssets = 0;
    for (const acc of accounts) {
      totalAssets += acc.balance;
      report += `  • ${acc.name}: ${this.formatCurrency(acc.balance)}\n`;
    }
    report += `  --------------------------------\n`;
    report += `  💰 Total Liquid Wealth: ${this.formatCurrency(totalAssets)}\n\n`;

    report += `👤 **COUNTERPARTY LEDGER:**\n`;
    if (persons.length === 0) {
      report += `  • No outstanding counterparties.\n`;
    } else {
      for (const p of persons) {
        const bal =
          p.netBalance > 0
            ? `Owes you +${this.formatCurrency(p.netBalance)}`
            : p.netBalance < 0
            ? `You owe -${this.formatCurrency(Math.abs(p.netBalance))}`
            : 'Settled';
        report += `  • ${p.name}: ${bal}\n`;
      }
    }

    return report;
  }

  static async handleQuery(env: Env, db: MongoDBClient, query: string): Promise<string> {
    if (!query || query.trim().length === 0) {
      return `Please provide a question. Example: \`/query How much did I spend on food this month?\``;
    }

    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();
    const persons = await db.getAllPersons();

    const contextSummary = `
Monthly Income: ${stats.totalIncome} PKR
Monthly Expenses: ${stats.totalExpense} PKR
Category Breakdown: ${JSON.stringify(stats.categoryBreakdown)}
Account Balances: ${accounts.map(a => `${a.name}: ${a.balance}`).join(', ')}
Person Ledger: ${persons.map(p => `${p.name}: ${p.netBalance}`).join(', ')}
`;

    return await AIService.answerFinancialQuery(env, query, contextSummary);
  }

  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
  }

  private static getFormattedMonthName(monthIso: string): string {
    const date = new Date(monthIso + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  private static getCategoryEmoji(cat: string): string {
    const c = cat.toLowerCase();
    if (c.includes('food') || c.includes('dining')) return '🍔';
    if (c.includes('grocery') || c.includes('groceries')) return '🛒';
    if (c.includes('bill') || c.includes('utility')) return '💡';
    if (c.includes('rent')) return '🏠';
    if (c.includes('transport')) return '🚗';
    if (c.includes('shopping')) return '🛍️';
    if (c.includes('salary')) return '💼';
    return '📦';
  }

  private static getAccountEmoji(accName: string): string {
    const a = accName.toLowerCase();
    if (a.includes('jazzcash')) return '📱';
    if (a.includes('easypaisa')) return '📲';
    if (a.includes('nayapay') || a.includes('sadapay')) return '💳';
    if (a.includes('meezan') || a.includes('hbl') || a.includes('ubl')) return '🏦';
    if (a.includes('cash')) return '💵';
    return '💳';
  }
}
