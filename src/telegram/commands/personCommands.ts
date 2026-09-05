import { MongoDBClient } from '../../db/mongodb';
import { PersonResolver } from '../../services/personResolver';

export class PersonCommands {
  static async handlePersons(db: MongoDBClient): Promise<string> {
    const persons = await db.getAllPersons();
    let text = `👥 **Person Ledger & Counterparties:**\n`;
    text += `──────────────────────\n`;

    if (persons.length === 0) {
      text += `No persons logged yet. Mention someone in a transaction to start tracking!`;
      return text;
    }

    for (const p of persons) {
      const balanceStr =
        p.netBalance > 0
          ? `🟢 Owes you ${this.formatCurrency(p.netBalance)}`
          : p.netBalance < 0
          ? `🔴 You owe ${this.formatCurrency(Math.abs(p.netBalance))}`
          : `⚪ Settled (0 PKR)`;

      text += `👤 **${p.name}**\n`;
      text += `  • Status: ${balanceStr}\n`;
      text += `  • Accounts: ${p.accounts.join(', ') || 'General'}\n`;
      text += `  • Aliases: ${p.aliases.join(', ')}\n\n`;
    }

    text += `💡 *To settle debt with someone, use:* \`/settle <PersonName>\``;
    return text;
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
      await db.updatePersonBalance(resolved.person._id, -currentBalance);
      return `🤝 **Ledger Settled!**\n──────────────────────\n👤 **Person:** ${resolved.person.name}\n⚖️ **Previous Balance:** ${this.formatCurrency(currentBalance)}\n🟢 **New Balance:** 0 PKR (Fully Settled)`;
    } else {
      const delta = currentBalance > 0 ? -settleAmount : settleAmount;
      await db.updatePersonBalance(resolved.person._id, delta);
      return `🤝 **Debt Payment Logged!**\n──────────────────────\n👤 **Person:** ${resolved.person.name}\n💰 **Settled Amount:** ${this.formatCurrency(settleAmount)}\n🟢 **Remaining Balance:** ${this.formatCurrency(currentBalance + delta)}`;
    }
  }

  static async handlePaylink(db: MongoDBClient, args: string): Promise<string> {
    const personName = args.trim() || 'Friend';
    const resolved = await PersonResolver.resolvePerson(db, personName);
    const amountOwed = resolved.person ? Math.max(resolved.person.netBalance, 1000) : 1000;

    const { RaastQrService } = await import('../../services/raastQrService');
    const emvPayload = RaastQrService.generateEmvCoPayload({
      receiverTitle: 'Finance AI Settlement',
      ibanOrMobile: '03001234567',
      amount: amountOwed,
      note: `Settlement with ${resolved.person?.name || personName}`
    });
    const qrUrl = RaastQrService.getQrImageUrl(emvPayload);

    return `📲 **Shareable Raast / Mobile Wallet Payment Request**\n──────────────────────\n👤 **To:** ${resolved.person?.name || personName}\n💰 **Amount Owed:** ${this.formatCurrency(amountOwed)}\n\n*Copy & paste message to send to ${personName}:*\n\`"Hey ${resolved.person?.name || personName}! Please transfer ${this.formatCurrency(amountOwed)} for our shared expense via Raast. Scan QR or transfer to my Raast ID. Thanks!"\`\n\n🖼️ **Instant Raast Scan-to-Pay QR:**\n[Tap to Open & Scan QR Code](${qrUrl})`;
  }

  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
  }
}
