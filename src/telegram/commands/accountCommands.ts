import { MongoDBClient } from '../../db/mongodb';

export class AccountCommands {
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
      text += `${this.getAccountEmoji(acc.name)} **${acc.name}** (${acc.type.replace('_', ' ')})\n`;
      text += `  💰 Balance: **${this.formatCurrency(acc.balance)}**\n\n`;
    }

    text += `──────────────────────\n`;
    text += `💎 **Total Liquid Balance:** ${this.formatCurrency(totalAssets)}\n\n`;
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
    return `✅ **Account Balance Updated!**\n──────────────────────\n🏦 **Account:** ${accountName}\n💰 **New Balance:** ${this.formatCurrency(newBalance)}`;
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

    await db.updateAccountBalance(fromAccount, -amount);
    await db.updateAccountBalance(toAccount, amount);

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

    return `🔄 **Internal Account Transfer Completed!**\n──────────────────────\n📤 **From:** ${fromAccount}\n📥 **To:** ${toAccount}\n💰 **Amount:** ${this.formatCurrency(amount)}`;
  }

  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
  }

  static getAccountEmoji(accName: string): string {
    const a = accName.toLowerCase();
    if (a.includes('jazzcash')) return '📱';
    if (a.includes('easypaisa')) return '📲';
    if (a.includes('nayapay') || a.includes('sadapay')) return '💳';
    if (a.includes('meezan') || a.includes('hbl') || a.includes('ubl')) return '🏦';
    if (a.includes('cash')) return '💵';
    return '💳';
  }
}
