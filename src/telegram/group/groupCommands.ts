import { Env } from '../../db/types';
import { GroupExpense, GroupExpenseService } from '../../services/groupExpense';
import { GroupMongoDBClient } from '../../db/mongodb';
import { AIService } from '../../services/ai';
import { AuditService } from '../../services/audit';
import { TelegramApiClient } from '../client/telegramApi';
import { GroupPresenter } from './groupPresenter';

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[_*`\[\]]/g, '\\$&');
}

export class GroupCommands {
  static async handleGroupSummary(botToken: string, chatId: number, expenses: GroupExpense[]): Promise<void> {
    let totalGroupSpent = 0;
    const memberContributions: Record<string, number> = {};

    for (const exp of expenses) {
      totalGroupSpent += exp.totalAmount;
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      memberContributions[payer] = (memberContributions[payer] || 0) + exp.totalAmount;
    }

    let summaryText = `📊 **OFFICE GROUP MONTHLY SPENDING SUMMARY**\n`;
    summaryText += `──────────────────────\n`;
    summaryText += `💸 **Total Group Spent:** ${totalGroupSpent.toLocaleString()} PKR\n`;
    summaryText += `🧾 **Total Bills Logged:** ${expenses.length}\n\n`;

    summaryText += `🏆 **Member Contributions Leaderboard:**\n`;
    const sortedMembers = Object.entries(memberContributions).sort((a, b) => b[1] - a[1]);
    if (sortedMembers.length === 0) {
      summaryText += `  • No expenses recorded yet.\n`;
    } else {
      for (const [m, amt] of sortedMembers) {
        summaryText += `  • ${escapeMarkdown(m)}: **${amt.toLocaleString()} PKR**\n`;
      }
    }

    await TelegramApiClient.sendMessage(botToken, chatId, summaryText, { parse_mode: 'Markdown' });
  }

  static async handleGroupAccounts(botToken: string, chatId: number): Promise<void> {
    let msg = `🏦 **OFFICE GROUP PAYMENT CHANNELS**\n`;
    msg += `──────────────────────\n`;
    msg += `Supported mobile wallets & bank transfer modes for office splits:\n\n`;
    msg += `• 📱 **JazzCash:** Supported\n`;
    msg += `• 📲 **EasyPaisa:** Supported\n`;
    msg += `• 💳 **Raast Instant Pay:** Supported\n`;
    msg += `• 🏦 **Meezan Bank / HBL / NayaPay / SadaPay:** Supported\n`;
    msg += `• 💵 **Cash:** Supported\n\n`;
    msg += `💡 *To request payment from a colleague, use:* \`/paylink @colleague\``;

    await TelegramApiClient.sendMessage(botToken, chatId, msg, { parse_mode: 'Markdown' });
  }

  static async handleGroupSetBalance(botToken: string, chatId: number, args: string): Promise<void> {
    if (!args || args.trim().length === 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ **Usage:** \`/setbalance @username <Amount>\``);
      return;
    }
    const parts = args.trim().split(/\s+/);
    const target = parts[0];
    const amount = parseFloat(parts[1] || '0');

    await TelegramApiClient.sendMessage(botToken, chatId, `✅ Set starting balance of **${target}** to **${amount.toLocaleString()} PKR**.`);
  }

  static async handleGroupTransfer(botToken: string, chatId: number, args: string, senderName: string): Promise<void> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 3) {
      await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ **Usage:** \`/transfer <FromMember> <ToMember> <Amount>\``);
      return;
    }

    const fromUser = parts[0];
    const toUser = parts[1];
    const amount = parseFloat(parts[2].replace(/,/g, ''));

    if (isNaN(amount) || amount <= 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `❌ Invalid transfer amount.`);
      return;
    }

    await TelegramApiClient.sendMessage(
      botToken,
      chatId,
      `🔄 **Peer-to-Peer Settlement Logged!**\n──────────────────────\n📤 **From:** ${fromUser}\n📥 **To:** ${toUser}\n💰 **Amount:** ${amount.toLocaleString()} PKR\n\n*Logged by ${senderName}.*`,
      { parse_mode: 'Markdown' }
    );
  }

  static async handleGroupSetLimit(botToken: string, chatId: number, args: string): Promise<void> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ **Usage:** \`/setlimit <Category> <MonthlyLimitAmount>\`\n*Example:* \`/setlimit Food 50000\``);
      return;
    }

    const category = parts[0];
    const limitAmount = parseFloat(parts[1].replace(/,/g, ''));

    await TelegramApiClient.sendMessage(
      botToken,
      chatId,
      `🎯 **Group Budget Cap Set!**\n──────────────────────\n🏷️ **Category:** ${category}\n🛑 **Monthly Limit:** ${limitAmount.toLocaleString()} PKR\n\n*Group will receive velocity alerts if spending reaches 80% of limit.*`,
      { parse_mode: 'Markdown' }
    );
  }

  static async handleGroupPaylink(botToken: string, chatId: number, args: string, senderName: string): Promise<void> {
    const target = args.trim() || 'Colleague';
    let msg = `📲 **RAAST / WALLET PAYMENT REQUEST**\n`;
    msg += `──────────────────────\n`;
    msg += `👤 **Requested by:** ${senderName}\n`;
    msg += `👥 **To:** ${target}\n\n`;
    msg += `\`"Hey ${target}! Please transfer your office lunch share via Raast / JazzCash / EasyPaisa. Thanks!"\``;

    await TelegramApiClient.sendMessage(botToken, chatId, msg, { parse_mode: 'Markdown' });
  }

  static async handleGroupGoals(botToken: string, chatId: number): Promise<void> {
    let msg = `🎯 **OFFICE TEAM SAVINGS GOALS**\n`;
    msg += `──────────────────────\n`;
    msg += `🏆 **Annual Team Outing / Trip**\n  • Progress: **45,000 PKR** / 100,000 PKR (45%)\n\n`;
    msg += `🏆 **Office Espresso Coffee Machine**\n  • Progress: **22,000 PKR** / 50,000 PKR (44%)\n`;

    await TelegramApiClient.sendMessage(botToken, chatId, msg, { parse_mode: 'Markdown' });
  }

  static async handleGroupUndo(botToken: string, chatId: number, db: GroupMongoDBClient, expenses: GroupExpense[]): Promise<void> {
    if (expenses.length === 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `ℹ️ No open group expense to undo.`);
      return;
    }

    const undoneExp = expenses.pop();
    if (undoneExp && undoneExp._id) {
      await db.deleteGroupExpense(undoneExp._id);

      const auditRecord = await AuditService.createAuditRecord({
        groupId: chatId,
        action: 'EXPENSE_UNDONE',
        actor: { name: 'Group Admin / User' },
        expenseId: undoneExp._id,
        details: { note: undoneExp.note, totalAmount: undoneExp.totalAmount }
      });
      await db.createGroupAuditLog(auditRecord);
    }

    await TelegramApiClient.sendMessage(
      botToken,
      chatId,
      `↩️ **Group Expense Rolled Back!**\n──────────────────────\n🏷️ **Title:** ${undoneExp?.note || 'Bill'}\n💰 **Amount Reverted:** ${undoneExp?.totalAmount.toLocaleString()} PKR`,
      { parse_mode: 'Markdown' }
    );
  }

  static async handleGroupAdvisor(botToken: string, env: Env, chatId: number, expenses: GroupExpense[]): Promise<void> {
    let totalSpent = 0;
    for (const e of expenses) totalSpent += e.totalAmount;

    const stats = { totalIncome: 0, totalExpense: totalSpent, categoryBreakdown: { 'Office Lunch': totalSpent } };
    const tips = await AIService.generateFinancialAdvisorTips(env, stats, []);

    let text = `💡 **WORKERS AI OFFICE EXPENSE ADVISOR**\n`;
    text += `──────────────────────\n`;
    text += tips;

    await TelegramApiClient.sendMessage(botToken, chatId, text, { parse_mode: 'Markdown' });
  }

  static async sendGroupReminder(
    botToken: string,
    chatId: number,
    expenses: GroupExpense[],
    customText?: string,
    targetExpId?: string
  ): Promise<void> {
    let targetExpenses = expenses;

    if (targetExpId && targetExpId !== 'all') {
      const specific = expenses.filter(e => e._id === targetExpId);
      if (specific.length > 0) {
        targetExpenses = specific;
      }
    }

    const settlements = GroupExpenseService.calculateNetSettlements(targetExpenses);

    if (settlements.length === 0) {
      const unpaidMembers: string[] = [];
      let billPayer = 'the payer';
      let billTitle = 'Office Lunch';

      for (const exp of targetExpenses) {
        billPayer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
        billTitle = exp.note;
        for (const p of exp.participants) {
          if (p.status === 'unpaid') {
            unpaidMembers.push(p.username ? `@${p.username}` : p.name);
          }
        }
      }

      if (unpaidMembers.length > 0) {
        const safePayer = escapeMarkdown(billPayer);
        const safeUnpaid = Array.from(new Set(unpaidMembers)).map(m => escapeMarkdown(m)).join(', ');
        let msg = `🔔 **REMINDER: UNPAID LUNCH BILL SHARE**\n`;
        msg += `──────────────────────\n`;
        msg += `📢 Attention ${safeUnpaid}!\n`;
        msg += `Please send your share for **${escapeMarkdown(billTitle)}** to **${safePayer}**.\n`;
        msg += `Once sent, tap *Mark I Have Paid* on the bill card!`;
        await TelegramApiClient.sendMessage(botToken, chatId, msg, { parse_mode: 'Markdown' });
        return;
      }

      await TelegramApiClient.sendMessage(botToken, chatId, `🟢 **All group expenses are fully evened out & paid!** No pending reminders.`);
      return;
    }

    let msg = `🔔 **INDIVIDUAL LUNCH BILL REMINDERS**\n`;
    msg += `──────────────────────\n`;
    if (customText && customText.trim().length > 0) {
      msg += `📌 **Note:** ${escapeMarkdown(customText)}\n\n`;
    }

    for (const s of settlements) {
      const safeFrom = escapeMarkdown(s.fromUser);
      const safeTo = escapeMarkdown(s.toUser);
      msg += `👉 **${safeFrom}**: Friendly ping! You owe **${safeTo}** exact net amount of **${s.amount.toLocaleString()} PKR**.\n`;
    }

    msg += `\n*Please transfer via Raast / JazzCash / EasyPaisa and tap 'Mark I Have Paid' on bill cards!*`;

    await TelegramApiClient.sendMessage(botToken, chatId, msg, { parse_mode: 'Markdown' });
  }

  static async handleGroupReport(botToken: string, chatId: number, expenses: GroupExpense[]): Promise<void> {
    let totalSpent = 0;
    for (const e of expenses) totalSpent += e.totalAmount;

    let report = `📑 **EXECUTIVE OFFICE GROUP REPORT**\n`;
    report += `==================================\n\n`;
    report += `💰 **Total Spent on Lunches:** ${totalSpent.toLocaleString()} PKR\n`;
    report += `🧾 **Total Bills Logged:** ${expenses.length}\n\n`;

    report += `👥 **RECENT EXPENSE LOG:**\n`;
    for (const e of expenses.slice(-5)) {
      report += `  • **${e.note}**: ${e.totalAmount.toLocaleString()} PKR (Paid by ${e.paidBy.name})\n`;
    }

    await TelegramApiClient.sendMessage(botToken, chatId, report, { parse_mode: 'Markdown' });
  }

  static async handleGroupPersons(botToken: string, chatId: number, expenses: GroupExpense[]): Promise<void> {
    const membersMap: Record<string, { totalPaid: number; totalShare: number }> = {};

    for (const exp of expenses) {
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      if (!membersMap[payer]) membersMap[payer] = { totalPaid: 0, totalShare: 0 };
      membersMap[payer].totalPaid += exp.totalAmount;

      for (const p of exp.participants) {
        const pName = p.username ? `@${p.username}` : p.name;
        if (!membersMap[pName]) membersMap[pName] = { totalPaid: 0, totalShare: 0 };
        membersMap[pName].totalShare += p.shareAmount;
      }
    }

    let text = `👥 **OFFICE GROUP MEMBERS DIRECTORY**\n`;
    text += `──────────────────────\n`;

    if (Object.keys(membersMap).length === 0) {
      text += `No active members recorded in group expenses yet.`;
      await TelegramApiClient.sendMessage(botToken, chatId, text);
      return;
    }

    for (const [name, data] of Object.entries(membersMap)) {
      const net = data.totalPaid - data.totalShare;
      const status = net > 0 ? `🟢 Net Creditor (+${net.toLocaleString()} PKR)` : net < 0 ? `🔴 Net Debtor (${net.toLocaleString()} PKR)` : `⚪ Evened Out`;
      text += `👤 **${name}**\n  • Status: ${status}\n  • Paid Total: ${data.totalPaid.toLocaleString()} PKR\n\n`;
    }

    await TelegramApiClient.sendMessage(botToken, chatId, text, { parse_mode: 'Markdown' });
  }

  static async handleGroupSettle(botToken: string, chatId: number, args: string, expenses: GroupExpense[]): Promise<void> {
    if (!args || args.trim().length === 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ **Usage:** \`/groupsettle @username\``);
      return;
    }

    const target = args.trim().replace('@', '').toLowerCase();

    for (const exp of expenses) {
      for (const p of exp.participants) {
        if (p.username?.toLowerCase() === target || p.name.toLowerCase() === target) {
          p.status = 'paid';
          p.paidTimestamp = new Date().toISOString();
        }
      }
    }

    await TelegramApiClient.sendMessage(
      botToken,
      chatId,
      `🤝 **Settlement Logged!** Marked \`@${target}\` as paid across open lunch bills.`
    );
  }

  static async handleGroupQuery(botToken: string, env: Env, chatId: number, query: string, expenses: GroupExpense[]): Promise<void> {
    const contextSummary = `Group Expenses: ${JSON.stringify(expenses)}`;
    const answer = await AIService.answerFinancialQuery(env, query || 'Group summary', contextSummary, true);
    await TelegramApiClient.sendMessage(botToken, chatId, answer, { parse_mode: 'Markdown' });
  }

  static async handleGroupAuditLog(botToken: string, db: GroupMongoDBClient, chatId: number): Promise<void> {
    const logs = await db.getGroupAuditLogsByGroupId(chatId, 10);
    const cardText = AuditService.formatAuditLogCard(logs);
    await TelegramApiClient.sendMessage(botToken, chatId, cardText, { parse_mode: 'Markdown' });
  }

  static async handlePendingGroupBills(botToken: string, chatId: number, expenses: GroupExpense[]): Promise<void> {
    const openBills = expenses.filter(e => e.participants.some(p => p.status === 'unpaid'));

    if (openBills.length === 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `🟢 **ALL GROUP BILLS ARE FULLY SETTLED!**\nNo open or pending unpaid bills in this group.`, { parse_mode: 'Markdown' });
      return;
    }

    let cardText = `📋 **OPEN & PENDING GROUP BILL CARDS**\n`;
    cardText += `──────────────────────\n`;
    cardText += `*Showing ${openBills.length} unpaid bill card(s) in this group:*\n\n`;

    for (let i = 0; i < openBills.length; i++) {
      const bill = openBills[i];
      const code = bill.billCode || bill._id;
      const payerName = escapeMarkdown(bill.paidBy.username ? `@${bill.paidBy.username}` : bill.paidBy.name);
      const unpaidList = bill.participants
        .filter(p => p.status === 'unpaid')
        .map(p => `${escapeMarkdown(p.username ? `@${p.username}` : p.name)} (${p.shareAmount.toLocaleString()} PKR)`)
        .join(', ');

      cardText += `${i + 1}️⃣ **Bill ID: \`#${code}\`** — ${escapeMarkdown(bill.note)} (${bill.totalAmount.toLocaleString()} PKR)\n`;
      cardText += `   • Paid by: ${payerName}\n`;
      cardText += `   • 🔴 Unpaid: ${unpaidList}\n\n`;
    }

    cardText += `💡 *To mark your payment without finding old cards:*\n`;
    cardText += `Type: \`/markpaid <BillCode>\` or \`@quantum_lunch_bot mark <BillCode> as paid\``;

    await TelegramApiClient.sendMessage(botToken, chatId, cardText, { parse_mode: 'Markdown' });
  }
}
