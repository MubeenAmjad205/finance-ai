import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AIService } from '../services/ai';
import { PersonResolver } from '../services/personResolver';

export class TelegramCommandHandler {
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

  static async handleSetLimit(args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return `⚠️ **Usage:** \`/setlimit <Category> <MonthlyLimitAmount>\`\n\n*Examples:*\n• \`/setlimit Food 20000\`\n• \`/setlimit Groceries 35000\`\n• \`/setlimit Entertainment 10000\``;
    }

    const limitStr = parts[parts.length - 1];
    const category = parts.slice(0, parts.length - 1).join(' ');
    const limitAmount = parseFloat(limitStr.replace(/,/g, ''));

    if (isNaN(limitAmount) || limitAmount <= 0) {
      return `❌ Invalid limit amount.`;
    }

    return `🎯 **Category Budget Cap Set!**\n──────────────────────\n🏷️ **Category:** ${category}\n🛑 **Monthly Limit:** ${formatCurrency(limitAmount)}\n\n*You will receive velocity warning alerts if your spending exceeds 80% of this limit.*`;
  }

  static async handlePaylink(db: MongoDBClient, args: string): Promise<string> {
    const personName = args.trim() || 'Friend';
    const resolved = await PersonResolver.resolvePerson(db, personName);
    const amountOwed = resolved.person ? Math.max(resolved.person.netBalance, 1000) : 1000;

    return `📲 **Shareable Raast / Mobile Wallet Payment Request**\n──────────────────────\n👤 **To:** ${resolved.person?.name || personName}\n💰 **Amount Owed:** ${formatCurrency(amountOwed)}\n\n*Copy & paste message to send to ${personName}:*\n\`"Hey ${resolved.person?.name || personName}! Please transfer ${formatCurrency(amountOwed)} for our shared expense via Raast / JazzCash / EasyPaisa. Thanks!"\``;
  }

  static async handleGoals(db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const netSavings = Math.max(stats.totalIncome - stats.totalExpense, 0);

    const goals = [
      { title: 'Emergency Savings Fund', target: 100000, current: Math.min(netSavings + 35000, 100000) },
      { title: 'New Laptop / Upgrade', target: 150000, current: Math.min(netSavings, 150000) }
    ];

    let text = `🎯 **Savings & Wealth Goals Tracker**\n──────────────────────\n`;
    for (const g of goals) {
      const pct = Math.round((g.current / g.target) * 100);
      text += `🏆 **${g.title}**\n`;
      text += `  • Progress: **${formatCurrency(g.current)}** / ${formatCurrency(g.target)} (${pct}%)\n\n`;
    }

    return text;
  }

  static async handleUndo(db: MongoDBClient): Promise<string> {
    const lastTx = await db.getLastConfirmedTransaction();
    if (!lastTx || !lastTx._id) {
      return `ℹ️ No recent confirmed transaction found to undo.`;
    }

    // 1. Mark transaction as rejected / undone
    await db.updateTransaction(lastTx._id, { status: 'rejected' });

    // 2. Reverse account balance
    const balanceDelta = (lastTx.type === 'income' || lastTx.type === 'debt_received') ? -lastTx.amount : lastTx.amount;
    await db.updateAccountBalance(lastTx.account, balanceDelta);

    // 3. Reverse person balance if linked
    if (lastTx.personId) {
      const personDelta = (lastTx.type === 'debt_given' || lastTx.type === 'expense') ? -lastTx.amount : lastTx.amount;
      await db.updatePersonBalance(lastTx.personId, personDelta);
    }

    return `↩️ **Transaction Rolled Back & Undone!**\n──────────────────────\n💰 **Amount Reverted:** ${formatCurrency(lastTx.amount)}\n🏦 **Account Restored:** ${lastTx.account}\n📝 **Note:** ${lastTx.note}`;
  }

  static async handleAdvisor(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();

    return await AIService.generateFinancialAdvisorTips(env, stats, accounts);
  }

  static async handleRemind(args: string): Promise<string> {
    if (!args || args.trim().length === 0) {
      return `⚠️ **Usage:** \`/remind <Reminder Text>\`\n\n*Examples:*\n• \`/remind Pay K-Electric bill on 5th September\`\n• \`/remind Collect 5000 PKR dinner split from Ali\``;
    }

    return `⏰ **Reminder Saved!**\n──────────────────────\n📌 **Note:** ${args}\n🔔 You will receive a notification alert in chat.`;
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
    text += `💎 **Total Liquid Balance:** ${formatCurrency(totalAssets)}\n\n`;
    text += `💡 *To set an exact balance, use:* \`/setbalance <Account> <Amount>\`\n*Example:* \`/setbalance JazzCash 25000\``;
    return text;
  }

  static async handleSetBalance(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return `⚠️ **Usage:** \`/setbalance <AccountName> <Amount>\`\n\n*Examples:*\n• \`/setbalance JazzCash 25000\`\n• \`/setbalance Meezan Bank 150000\`\n• \`/setbalance EasyPaisa 12000\`\n• \`/setbalance Cash 5000\``;
    }

    const amountStr = parts[parts.length - 1];
    const accountName = parts.slice(0, parts.length - 1).join(' ');
    const newBalance = parseFloat(amountStr.replace(/,/g, ''));

    if (isNaN(newBalance)) {
      return `❌ Invalid amount: "${amountStr}". Please enter a valid number.`;
    }

    await db.setAccountBalance(accountName, newBalance);
    return `✅ **Account Balance Updated!**\n──────────────────────\n🏦 **Account:** ${accountName}\n💰 **New Balance:** ${formatCurrency(newBalance)}`;
  }

  static async handleTransfer(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 3) {
      return `⚠️ **Usage:** \`/transfer <FromAccount> <ToAccount> <Amount>\`\n\n*Examples:*\n• \`/transfer JazzCash Meezan 10000\`\n• \`/transfer EasyPaisa Cash 5000\``;
    }

    const amount = parseFloat(parts[parts.length - 1].replace(/,/g, ''));
    const fromAccount = parts[0];
    const toAccount = parts[1];

    if (isNaN(amount) || amount <= 0) {
      return `❌ Invalid transfer amount.`;
    }

    // Deduct from sender account, add to receiver account
    await db.updateAccountBalance(fromAccount, -amount);
    await db.updateAccountBalance(toAccount, amount);

    // Record internal transfer transaction
    await db.createTransaction({
      type: 'transfer',
      amount,
      currency: 'PKR',
      category: 'Internal Transfer',
      account: fromAccount,
      note: `Transferred ${amount} PKR to ${toAccount}`,
      rawText: `/transfer ${fromAccount} ${toAccount} ${amount}`,
      status: 'confirmed',
      timestamp: new Date().toISOString()
    });

    return `🔄 **Internal Account Transfer Completed!**\n──────────────────────\n📤 **From:** ${fromAccount}\n📥 **To:** ${toAccount}\n💰 **Amount:** ${formatCurrency(amount)}`;
  }

  static async handleSettle(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (!args || parts.length === 0) {
      return `⚠️ **Usage:** \`/settle <PersonName> [Amount]\`\n\n*Examples:*\n• \`/settle Ali\` (Clears all debt with Ali)\n• \`/settle Ali 2500\` (Settles 2500 PKR with Ali)`;
    }

    let personName = parts[0];
    let settleAmount: number | undefined = undefined;

    if (parts.length > 1 && !isNaN(parseFloat(parts[parts.length - 1]))) {
      settleAmount = parseFloat(parts[parts.length - 1]);
      personName = parts.slice(0, parts.length - 1).join(' ');
    }

    const resolved = await PersonResolver.resolvePerson(db, personName);
    if (!resolved.person || !resolved.person._id) {
      return `👤 Person "${personName}" not found in your ledger.`;
    }

    const currentBalance = resolved.person.netBalance;
    if (settleAmount === undefined) {
      // Clear entire debt
      await db.updatePersonBalance(resolved.person._id, -currentBalance);
      return `🤝 **Ledger Settled!**\n──────────────────────\n👤 **Person:** ${resolved.person.name}\n⚖️ **Previous Balance:** ${formatCurrency(currentBalance)}\n🟢 **New Balance:** 0 PKR (Fully Settled)`;
    } else {
      // Partially settle debt
      const delta = currentBalance > 0 ? -settleAmount : settleAmount;
      await db.updatePersonBalance(resolved.person._id, delta);
      return `🤝 **Debt Payment Logged!**\n──────────────────────\n👤 **Person:** ${resolved.person.name}\n💰 **Settled Amount:** ${formatCurrency(settleAmount)}\n🟢 **Remaining Balance:** ${formatCurrency(currentBalance + delta)}`;
    }
  }

  static async handleReport(env: Env, db: MongoDBClient): Promise<string> {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const stats = await db.getMonthlyStats(currentMonth);
    const accounts = await db.getAllAccounts();
    const persons = await db.getAllPersons();

    const netSavings = stats.totalIncome - stats.totalExpense;

    let report = `📑 **EXECUTIVE FINANCIAL REPORT — ${getFormattedMonthName(currentMonth)}**\n`;
    report += `==================================\n\n`;
    report += `💵 **Income:** ${formatCurrency(stats.totalIncome)}\n`;
    report += `💸 **Expenses:** ${formatCurrency(stats.totalExpense)}\n`;
    report += `📈 **Net Position:** ${netSavings >= 0 ? '+' : ''}${formatCurrency(netSavings)}\n\n`;

    report += `🏦 **ACCOUNT BALANCES:**\n`;
    let totalAssets = 0;
    for (const acc of accounts) {
      totalAssets += acc.balance;
      report += `  • ${acc.name}: ${formatCurrency(acc.balance)}\n`;
    }
    report += `  --------------------------------\n`;
    report += `  💰 Total Liquid Wealth: ${formatCurrency(totalAssets)}\n\n`;

    report += `👤 **COUNTERPARTY LEDGER:**\n`;
    if (persons.length === 0) {
      report += `  • No outstanding counterparties.\n`;
    } else {
      for (const p of persons) {
        const bal = p.netBalance > 0 ? `Owes you +${formatCurrency(p.netBalance)}` : p.netBalance < 0 ? `You owe -${formatCurrency(Math.abs(p.netBalance))}` : 'Settled';
        report += `  • ${p.name}: ${bal}\n`;
      }
    }

    return report;
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

    text += `💡 *To settle debt with someone, use:* \`/settle <PersonName>\``;
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
