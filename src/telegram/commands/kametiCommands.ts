import { MongoDBClient } from '../../db/mongodb';

export class KametiCommands {
  static async handleKameti(db: MongoDBClient, args: string): Promise<string> {
    const trimmed = (args || '').trim();
    const parts = trimmed.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase() || '';

    if (subCmd === 'create') {
      return this.handleCreate(db, parts.slice(1).join(' '));
    } else if (subCmd === 'paid') {
      return this.handlePaid(db, parts.slice(1).join(' '));
    } else if (subCmd === 'payout') {
      return this.handlePayout(db, parts.slice(1).join(' '));
    } else if (subCmd === 'next') {
      return this.handleAdvanceMonth(db, parts.slice(1).join(' '));
    } else {
      return this.handleList(db);
    }
  }

  private static async handleList(db: MongoDBClient): Promise<string> {
    const kametis = await db.getAllKametis();
    if (kametis.length === 0) {
      return `🤝 **No active Kametis (Committees) found.**\n\nCreate one using:\n\`/kameti create <Name> <MonthlyAmount> <Member1, Member2, ...>\`\n\n*Example:*\n\`/kameti create OfficePot 10000 Ali, Usman, Hamza, Bilal\``;
    }

    let out = `🤝 **Active Kametis (Committees / کمیٹی):**\n`;
    out += `──────────────────────\n`;

    for (const k of kametis) {
      const potPool = k.monthlyAmount * k.members.length;
      const recipient = k.members.find(m => m.payoutMonth === k.currentMonth);

      out += `🏛️ **${k.name}** (${k.status.toUpperCase()})\n`;
      out += `💰 **Monthly Contribution:** ${k.monthlyAmount.toLocaleString()} PKR / person\n`;
      out += `🏆 **Total Pot Payout:** ${potPool.toLocaleString()} PKR\n`;
      out += `📅 **Current Round:** Month ${k.currentMonth} of ${k.totalMonths}\n`;
      out += `🎯 **This Month's Recipient:** ${recipient ? recipient.name : 'Unassigned'} ${recipient?.payoutReceived ? '✅ (Paid Out)' : '⏳ (Pending)'}\n\n`;

      out += `👥 **Member Status (Month ${k.currentMonth}):**\n`;
      for (const m of k.members) {
        const hasPaidThisMonth = m.paidMonths.includes(k.currentMonth);
        const payoutStatus = m.payoutReceived ? '👑 Recipient (Received)' : `(Month ${m.payoutMonth} Pot)`;
        out += `  • ${hasPaidThisMonth ? '✅' : '⏳'} **${m.name}**: ${hasPaidThisMonth ? 'Paid' : 'Unpaid'} ${payoutStatus}\n`;
      }
      out += `\n`;
    }

    out += `💡 *Quick Actions:*\n`;
    out += `• \`/kameti paid <Name> <Member>\` - Mark monthly payment\n`;
    out += `• \`/kameti payout <Name> <Member>\` - Confirm pot received\n`;
    out += `• \`/kameti next <Name>\` - Advance to next month`;

    return out;
  }

  private static async handleCreate(db: MongoDBClient, args: string): Promise<string> {
    // Format: <Name> <MonthlyAmount> <Member1, Member2, ...>
    const match = args.match(/^(\S+)\s+(\d+)\s+(.+)$/);
    if (!match) {
      return `❌ **Invalid Format.**\nUsage: \`/kameti create <Name> <MonthlyAmount> <Member1, Member2, ...>\`\n*Example:* \`/kameti create OfficePot 10000 Ali, Usman, Hamza, Bilal\``;
    }

    const name = match[1];
    const monthlyAmount = parseInt(match[2], 10);
    const rawMembers = match[3].split(/[,،]+/).map(m => m.trim()).filter(Boolean);

    if (rawMembers.length < 2) {
      return `❌ A Kameti needs at least 2 members.`;
    }

    const members = rawMembers.map((mName, idx) => ({
      name: mName,
      payoutMonth: idx + 1,
      payoutReceived: false,
      paidMonths: []
    }));

    const created = await db.createKameti({
      name,
      monthlyAmount,
      totalMonths: members.length,
      startDate: new Date().toISOString().substring(0, 10),
      currentMonth: 1,
      members,
      status: 'active'
    });

    const pot = monthlyAmount * members.length;
    let res = `✅ **Kameti "${name}" Created Successfully!**\n`;
    res += `──────────────────────\n`;
    res += `💰 **Monthly Contribution:** ${monthlyAmount.toLocaleString()} PKR\n`;
    res += `🏆 **Total Pot Payout:** ${pot.toLocaleString()} PKR\n`;
    res += `👥 **Members (${members.length}):**\n`;
    for (const m of members) {
      res += `  ${m.payoutMonth}. ${m.name} (Takes Month ${m.payoutMonth} Pot)\n`;
    }

    return res;
  }

  private static async handlePaid(db: MongoDBClient, args: string): Promise<string> {
    // Format: <KametiName> <MemberName>
    const parts = args.split(/\s+/);
    if (parts.length < 2) {
      return `❌ Usage: \`/kameti paid <KametiName> <MemberName>\`\n*Example:* \`/kameti paid OfficePot Ali\``;
    }

    const kName = parts[0];
    const mName = parts.slice(1).join(' ');

    const ok = await db.markKametiPaid(kName, mName);
    if (!ok) {
      return `❌ Could not find Kameti "${kName}" or member "${mName}".`;
    }

    return `✅ **Payment Logged!** Marked **${mName}** as paid for current month in **${kName}**.`;
  }

  private static async handlePayout(db: MongoDBClient, args: string): Promise<string> {
    const parts = args.split(/\s+/);
    if (parts.length < 2) {
      return `❌ Usage: \`/kameti payout <KametiName> <MemberName>\`\n*Example:* \`/kameti payout OfficePot Ali\``;
    }

    const kName = parts[0];
    const mName = parts.slice(1).join(' ');

    const ok = await db.markKametiPayout(kName, mName);
    if (!ok) {
      return `❌ Could not find Kameti "${kName}" or member "${mName}".`;
    }

    return `🎉 **Lump Sum Payout Confirmed!** **${mName}** has received this round's pot in **${kName}**.`;
  }

  private static async handleAdvanceMonth(db: MongoDBClient, args: string): Promise<string> {
    const kName = args.trim();
    if (!kName) {
      return `❌ Usage: \`/kameti next <KametiName>\``;
    }

    const newMonth = await db.advanceKametiMonth(kName);
    if (newMonth === null) {
      return `❌ Kameti "${kName}" not found.`;
    }

    const kameti = await db.getKametiByName(kName);
    if (kameti?.status === 'completed') {
      return `🏁 **Kameti "${kName}" has reached the final month and is now completed!** All members received their turn.`;
    }

    const recipient = kameti?.members.find(m => m.payoutMonth === newMonth);
    return `⏩ **Advanced "${kName}" to Month ${newMonth}!**\n🎯 This month's pot recipient is: **${recipient ? recipient.name : 'Unknown'}**.`;
  }
}
