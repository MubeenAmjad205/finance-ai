import { GroupExpense, GroupExpenseService } from '../../services/groupExpense';
import { TelegramApiClient } from '../client/telegramApi';

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[_*`\[\]]/g, '\\$&');
}

export class GroupPresenter {
  static async presentGroupExpenseCard(
    botToken: string,
    chatId: number | string,
    exp: GroupExpense,
    messageIdToEdit?: number
  ): Promise<void> {
    const rawPayerName = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
    const payerName = escapeMarkdown(rawPayerName);
    const safeNote = escapeMarkdown(exp.note);
    const codeTag = exp.billCode ? ` *(ID: #${exp.billCode})*` : '';
    const perPersonShare = Math.round(exp.totalAmount / (exp.participants.length || 1));
    const hasUnpaid = exp.participants.some(p => p.status === 'unpaid');

    let cardText = `🍔 **OFFICE LUNCH EXPENSE LOGGED**${codeTag}\n`;
    cardText += `──────────────────────\n`;
    cardText += `🏷️ **Bill Title:** ${safeNote}\n`;
    cardText += `💰 **Total Amount:** ${exp.totalAmount.toLocaleString()} PKR *(Paid by ${payerName})*\n`;
    cardText += `💵 **Share Per Person:** ${perPersonShare.toLocaleString()} PKR\n\n`;

    cardText += `👥 **Member Status:**\n`;
    for (const p of exp.participants) {
      const rawName = p.username ? `@${p.username}` : p.name;
      const displayName = escapeMarkdown(rawName);
      const statusIcon = p.status === 'paid' ? '🟢 Paid' : `🔴 Unpaid (${p.shareAmount.toLocaleString()} PKR)`;
      cardText += `  • ${displayName}: ${statusIcon}\n`;
    }

    if (hasUnpaid) {
      cardText += `\n*Tap buttons below to update your payment status:*`;
    } else {
      cardText += `\n🟢 **ALL MEMBERS HAVE PAID! (Fully Settled)**`;
    }

    const inlineKeyboard: any[][] = [];

    if (hasUnpaid) {
      inlineKeyboard.push([
        { text: `💳 Mark I Have Paid`, callback_data: `g_mark_paid:${exp._id}` },
        { text: `📲 Payment Info`, callback_data: `g_pay_info:${exp._id}` }
      ]);
      inlineKeyboard.push([
        { text: `🔔 Remind Unpaid`, callback_data: `g_remind_unpaid:${exp._id}` },
        { text: `📊 Full Group Ledger`, callback_data: `g_show_ledger` }
      ]);
    } else {
      inlineKeyboard.push([
        { text: `📲 Payment Details`, callback_data: `g_pay_info:${exp._id}` },
        { text: `📊 Full Group Ledger`, callback_data: `g_show_ledger` }
      ]);
    }

    inlineKeyboard.push([
      { text: `↩️ Roll Back / Delete`, callback_data: `g_undo:${exp._id}` }
    ]);

    if (messageIdToEdit) {
      await TelegramApiClient.editMessage(botToken, chatId, messageIdToEdit, cardText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    } else {
      await TelegramApiClient.sendMessage(botToken, chatId, cardText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    }
  }

  static async presentGroupBalanceMatrix(
    botToken: string,
    chatId: number | string,
    expenses: GroupExpense[]
  ): Promise<void> {
    if (expenses.length === 0) {
      await TelegramApiClient.sendMessage(botToken, chatId, `📊 **Group Ledger:** No open expenses recorded in this group yet.`);
      return;
    }

    const settlements = GroupExpenseService.calculateNetSettlements(expenses);
    let text = `📊 **OFFICE GROUP NET SETTLEMENT MATRIX**\n`;
    text += `──────────────────────\n`;

    if (settlements.length === 0) {
      text += `🟢 **All group expenses are fully settled / evened out!** No outstanding debts.`;
    } else {
      text += `*Multi-day lunch shares are dynamically evened out to minimize transfers:*\n\n`;
      for (const s of settlements) {
        text += `👉 **${escapeMarkdown(s.fromUser)}** owes **${escapeMarkdown(s.toUser)}**: **${s.amount.toLocaleString()} PKR**\n`;
      }
      text += `\n💡 *Example: If you paid 300 PKR yesterday and a colleague pays 300 PKR today, your debts auto-even out to 0 PKR!*`;
    }

    await TelegramApiClient.sendMessage(botToken, chatId, text, { parse_mode: 'Markdown' });
  }

  static async handleMemberBalanceQuery(
    botToken: string,
    chatId: number | string,
    expenses: GroupExpense[],
    targetUser: string
  ): Promise<void> {
    const profile = GroupExpenseService.getUserFinancialProfile(expenses, targetUser);

    let text = `👤 **MEMBER LEDGER CARD — ${profile.normalizedName}**\n`;
    text += `──────────────────────\n`;
    text += `💰 **Total Amount Paid for Group:** ${profile.totalPaid.toLocaleString()} PKR\n`;
    text += `🍽️ **Total Lunch Shares Consumed:** ${profile.totalShare.toLocaleString()} PKR\n`;

    const netSymbol = profile.netBalance > 0 ? '🟢 Net Creditor (+)' : profile.netBalance < 0 ? '🔴 Net Debtor (-)' : '⚪ Evened Out / Settled';
    text += `⚖️ **Net Position:** ${netSymbol} ${Math.abs(profile.netBalance).toLocaleString()} PKR\n\n`;

    text += `🤝 **Evened-Out Debt Status:**\n`;
    if (profile.owesList.length === 0 && profile.isOwedByList.length === 0) {
      text += `  • Completely settled! No open debts with any colleague.\n`;
    } else {
      for (const o of profile.owesList) {
        text += `  • Owes **${escapeMarkdown(o.toUser)}**: **${o.amount.toLocaleString()} PKR**\n`;
      }
      for (const b of profile.isOwedByList) {
        text += `  • Is owed by **${escapeMarkdown(b.fromUser)}**: **${b.amount.toLocaleString()} PKR**\n`;
      }
    }

    await TelegramApiClient.sendMessage(botToken, chatId, text, { parse_mode: 'Markdown' });
  }

  static async handleTemporalBillSettlementPrompt(
    botToken: string,
    chatId: number | string,
    expenses: GroupExpense[],
    resolvedDate: { isoDate: string; dayOfWeek: string; label: string },
    senderName: string,
    sender: any
  ): Promise<boolean> {
    const matchingExpenses = expenses.filter(e => e.timestamp && e.timestamp.startsWith(resolvedDate.isoDate));

    if (matchingExpenses.length === 0) {
      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `ℹ️ No group bills found recorded on **${resolvedDate.label}**. All settled or not logged for that day!`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    const targetExp = matchingExpenses.find(e => 
      e.participants.some(p => 
        (p.username === sender?.username || p.name.toLowerCase() === senderName.toLowerCase()) && 
        p.status === 'unpaid'
      )
    ) || matchingExpenses[0];

    const participant = targetExp.participants.find(p => 
      p.username === sender?.username || p.name.toLowerCase() === senderName.toLowerCase()
    );

    const userShare = participant ? participant.shareAmount : Math.round(targetExp.totalAmount / targetExp.participants.length);
    const rawPayer = targetExp.paidBy.username ? `@${targetExp.paidBy.username}` : targetExp.paidBy.name;

    const confirmationText = `🧾 **Bill Clarification (Human-in-the-Loop)**
──────────────────────
🗓️ **Date:** ${resolvedDate.label}
🍽️ **Expense:** ${targetExp.note}
💰 **Total Bill:** ${targetExp.totalAmount.toLocaleString()} PKR (Paid by ${rawPayer})
👤 **Your Share:** ${userShare.toLocaleString()} PKR (${participant?.status === 'paid' ? '🟢 Already Paid' : '🔴 Unpaid'})

*Are you talking about settling this bill?*`;

    await TelegramApiClient.sendMessage(botToken, chatId, confirmationText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Yes, Mark Paid`, callback_data: `g_mark_paid:${targetExp._id}` },
            { text: `📲 View Payment Info`, callback_data: `g_pay_info:${targetExp._id}` }
          ],
          [
            { text: `❌ No, Not this one`, callback_data: `g_cancel` }
          ]
        ]
      }
    });

    return true;
  }
}
