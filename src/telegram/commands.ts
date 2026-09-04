import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AIService } from '../services/ai';

export class TelegramCommandHandler {
  static async handleStart(env: Env): Promise<string> {
    return `👋 **Welcome to your AI Personal Finance Manager!**

I am your personal budget assistant running natively on **Cloudflare Workers AI**.

💡 **How to use me:**
1️⃣ **Log Expenses/Income:** Just type naturally!
   • *"Spent 1450 at Tehzeeb via JazzCash"*
   • *"Received 5000 from Ali Khan on EasyPaisa"*
   • *"Sent 2000 to Usman via Meezan Bank"*
2️⃣ **Send Receipt Screenshots:** Upload a photo of any receipt or payment confirmation!
3️⃣ **Interactive Confirmation:** I will always ask for your confirmation before saving anything!

📋 **Commands:**
• \`/summary\` - View monthly stats & spending breakdown
• \`/accounts\` - View JazzCash, EasyPaisa, Bank & Cash balances
• \`/persons\` - View counterparties & who owes what
• \`/query <question>\` - Ask AI any question about your expenses
• \`/help\` - View this help guide`;
  }

  static async handleSummary(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-09"
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();

    const netSavings = stats.totalIncome - stats.totalExpense;

    let text = `📊 **Financial Summary for ${getFormattedMonthName(currentMonth)}**\n`;
    text += `──────────────────────\n`;
    text += `💵 **Total Income:** ${formatCurrency(stats.totalIncome)}\n`;
    text += `💸 **Total Expenses:** ${formatCurrency(stats.totalExpense)}\n`;
    text += `📈 **Net Position:** ${netSavings >= 0 ? '🟢 +' : '🔴 '}${formatCurrency(netSavings)}\n\n`;

    text += `🏷️ **Top Categories:**\n`;
    const catEntries = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
    if (catEntries.length === 0) {
      text += `  • No expense records this month yet.\n`;
    } else {
      for (const [cat, amt] of catEntries) {
        text += `  • ${getCategoryEmoji(cat)} **${cat}:** ${formatCurrency(amt)}\n`;
      }
    }

    text += `\n🏦 **Account Balances:**\n`;
    for (const acc of accounts) {
      text += `  • ${getAccountEmoji(acc.name)} **${acc.name}:** ${formatCurrency(acc.balance)}\n`;
    }

    return text;
  }

  static async handleAccounts(db: MongoDBClient): Promise<string> {
    const accounts = await db.getAllAccounts();
    let text = `🏦 **Your Registered Accounts & Wallets:**\n`;
    text += `──────────────────────\n`;

    if (accounts.length === 0) {
      text += `No active accounts registered yet.`;
      return text;
    }

    let totalAssets = 0;
    for (const acc of accounts) {
      totalAssets += acc.balance;
      text += `${getAccountEmoji(acc.name)} **${acc.name}** (${acc.type.replace('_', ' ')})\n`;
      text += `  💰 Balance: **${formatCurrency(acc.balance)}**\n\n`;
    }

    text += `──────────────────────\n`;
    text += `💎 **Total Liquid Balance:** ${formatCurrency(totalAssets)}`;
    return text;
  }

  static async handlePersons(db: MongoDBClient): Promise<string> {
    const persons = await db.getAllPersons();
    let text = `👥 **Person Ledger & Counterparties:**\n`;
    text += `──────────────────────\n`;

    if (persons.length === 0) {
      text += `No persons logged yet. Mention someone in a transaction to start tracking!`;
      return text;
    }

    for (const p of persons) {
      const balanceStr = p.netBalance > 0 
        ? `🟢 Owes you ${formatCurrency(p.netBalance)}`
        : p.netBalance < 0 
          ? `🔴 You owe ${formatCurrency(Math.abs(p.netBalance))}`
          : `⚪ Settled (0 PKR)`;

      text += `👤 **${p.name}**\n`;
      text += `  • Status: ${balanceStr}\n`;
      text += `  • Accounts: ${p.accounts.join(', ') || 'General'}\n`;
      text += `  • Aliases: ${p.aliases.join(', ')}\n\n`;
    }

    return text;
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
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
}

function getFormattedMonthName(monthIso: string): string {
  const date = new Date(monthIso + '-01');
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCategoryEmoji(cat: string): string {
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

function getAccountEmoji(accName: string): string {
  const a = accName.toLowerCase();
  if (a.includes('jazzcash')) return '📱';
  if (a.includes('easypaisa')) return '📲';
  if (a.includes('nayapay') || a.includes('sadapay')) return '💳';
  if (a.includes('meezan') || a.includes('hbl') || a.includes('ubl')) return '🏦';
  if (a.includes('cash')) return '💵';
  return '💳';
}
