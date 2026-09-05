import { MongoDBClient } from '../../db/mongodb';
import { AccountService } from '../../services/accountService';

export class AccountCommands {
  static async handleAccounts(db: MongoDBClient): Promise<string> {
    const accounts = await db.getAllAccounts();
    let text = `🏦 **Your Registered Accounts & Wallets:**\n`;
    text += `──────────────────────\n`;

    if (!accounts || accounts.length === 0) {
      if (db.client.lastError) {
        return `⚠️ **Database Connection Error:**\n──────────────────────\nCould not retrieve accounts from MongoDB Atlas.\n\n\`${db.client.lastError}\`\n\n💡 *Please check your MONGODB_APP_ID and MONGODB_DATA_API_KEY in Cloudflare Worker secrets.*`;
      }
      text += `No active accounts registered yet.\n\n💡 *To add an account, use:* \`/setbalance <Account> <Amount>\`\n*Example:* \`/setbalance JazzCash 25000\``;
      return text;
    }

    let totalAssets = 0;
    for (const acc of accounts) {
      totalAssets += acc.balance || 0;
      const typeStr = acc.type ? acc.type.replace('_', ' ') : 'account';
      text += `${this.getAccountEmoji(acc.name)} **${acc.name}** (${typeStr})\n`;
      text += `  💰 Balance: **${this.formatCurrency(acc.balance || 0)}**\n\n`;
    }

    text += `──────────────────────\n`;
    text += `💎 **Total Liquid Balance:** ${this.formatCurrency(totalAssets)}\n\n`;
    text += `💡 *To set an exact balance, use:* \`/setbalance <Account> <Amount>\`\n*Example:* \`/setbalance JazzCash 25000\``;
    return text;
  }

  static async handleSetBalance(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return `⚠️ **Usage:** \`/setbalance <AccountName> <Amount>\` (or \`/setbalance <Amount> <AccountName>\`)\n\n*Examples:*\n• \`/setbalance JazzCash 25000\`\n• \`/setbalance 856.65 UBL\`\n• \`/setbalance Meezan Bank 150000\`\n• \`/setbalance Cash 5000\``;
    }

    let rawAccountName = '';
    let newBalance = NaN;

    // Check if amount is first or last argument
    const firstAsNum = parseFloat(parts[0].replace(/,/g, ''));
    const lastAsNum = parseFloat(parts[parts.length - 1].replace(/,/g, ''));

    if (!isNaN(firstAsNum) && isNaN(lastAsNum)) {
      newBalance = firstAsNum;
      rawAccountName = parts.slice(1).join(' ');
    } else if (!isNaN(lastAsNum)) {
      newBalance = lastAsNum;
      rawAccountName = parts.slice(0, parts.length - 1).join(' ');
    } else {
      return `❌ Could not find a valid balance amount in "${args}". Please enter a number.`;
    }

    // Canonicalize account name (e.g. "jazzcash" -> "JazzCash", "ubl" -> "UBL")
    const detected = AccountService.detectAccount(rawAccountName);
    const canonicalName = detected ? detected.name : (rawAccountName.charAt(0).toUpperCase() + rawAccountName.slice(1));

    const success = await db.setAccountBalance(canonicalName, newBalance);
    if (!success) {
      const errDetail = db.client.lastError || 'Unknown database write error';
      return `❌ **Database Error: Failed to Update Balance**\n──────────────────────\nCould not save balance for **${canonicalName}** to MongoDB Atlas.\n\n⚠️ **Error:** \`${errDetail}\`\n\n💡 *Hint:* Please verify that \`MONGODB_APP_ID\` and \`MONGODB_DATA_API_KEY\` are correctly set in Cloudflare Worker secrets.`;
    }

    return `✅ **Account Balance Updated!**\n──────────────────────\n🏦 **Account:** ${canonicalName}\n💰 **New Balance:** ${this.formatCurrency(newBalance)}`;
  }

  static async handleTransfer(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 3) {
      return `⚠️ **Usage:** \`/transfer <FromAccount> <ToAccount> <Amount>\`\n\n*Examples:*\n• \`/transfer JazzCash Meezan 10000\`\n• \`/transfer EasyPaisa Cash 5000\``;
    }

    const amount = parseFloat(parts[parts.length - 1].replace(/,/g, ''));
    const rawFrom = parts[0];
    const rawTo = parts[1];

    if (isNaN(amount) || amount <= 0) {
      return `❌ Invalid transfer amount.`;
    }

    const fromAccount = AccountService.detectAccount(rawFrom)?.name || rawFrom;
    const toAccount = AccountService.detectAccount(rawTo)?.name || rawTo;

    const fromUpdated = await db.updateAccountBalance(fromAccount, -amount);
    const toUpdated = await db.updateAccountBalance(toAccount, amount);

    if (!fromUpdated || !toUpdated) {
      const errDetail = db.client.lastError || 'Database update error';
      return `❌ **Database Error: Transfer Failed**\n──────────────────────\nCould not update account balances in MongoDB.\n⚠️ **Error:** \`${errDetail}\``;
    }

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
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
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
