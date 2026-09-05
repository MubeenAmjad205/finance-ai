import { GroupExpense } from '../../services/groupExpense';
import { GroupMongoDBClient } from '../../db/mongodb';
import { AuditService } from '../../services/audit';
import { TelegramApiClient } from '../client/telegramApi';
import { GroupPresenter } from './groupPresenter';

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[_*`\[\]]/g, '\\$&');
}

export class GroupCallbacks {
  static async handleGroupCallbackQuery(
    botToken: string,
    db: GroupMongoDBClient,
    getGroupExpenses: (chatId: number | string) => Promise<GroupExpense[]>,
    sendGroupReminder: (chatId: number, customText?: string, targetExpId?: string) => Promise<void>,
    handleGroupUndo: (chatId: number) => Promise<void>,
    cb: any
  ): Promise<void> {
    const callbackId = cb.id;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data: string = cb.data || '';
    const user = cb.from;
    const userName = user.username ? `@${user.username}` : (user.first_name || 'Member');

    const parts = data.split(':');
    const action = parts[0];
    const expId = parts[1];

    if (action === 'g_mark_paid') {
      const expenses = await getGroupExpenses(chatId);
      const exp = expenses.find(e => e._id === expId);
      if (exp) {
        for (const p of exp.participants) {
          if (p.username === user.username || p.name.toLowerCase() === userName.toLowerCase()) {
            p.status = 'paid';
            p.paidTimestamp = new Date().toISOString();
          }
        }
        await TelegramApiClient.answerCallback(botToken, callbackId, `✅ Marked ${userName} as paid!`);
        await GroupPresenter.presentGroupExpenseCard(botToken, chatId, exp, messageId);

        const auditRecord = await AuditService.createAuditRecord({
          groupId: chatId,
          action: 'MARKED_PAID',
          actor: { userId: user.id, username: user.username, name: userName },
          expenseId: expId,
          details: { note: exp.note, totalAmount: exp.totalAmount }
        });
        await db.createGroupAuditLog(auditRecord);
      }
    } else if (action === 'g_pay_info') {
      const expenses = await getGroupExpenses(chatId);
      const exp = expenses.find(e => e._id === expId);
      const rawPayer = exp ? (exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name) : 'Payer';
      const safePayer = escapeMarkdown(rawPayer);
      await TelegramApiClient.answerCallback(botToken, callbackId, `📲 Send payment to ${rawPayer}`);
      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `📲 **Payment Details for ${safePayer}:**\nSend Raast / JazzCash / EasyPaisa transfer to ${safePayer}. Once transferred, tap *Mark I Have Paid*!`,
        { parse_mode: 'Markdown' }
      );
    } else if (action === 'g_remind_unpaid') {
      await TelegramApiClient.answerCallback(botToken, callbackId, `🔔 Sent reminder to unpaid members!`);
      await sendGroupReminder(chatId, undefined, expId);
    } else if (action === 'g_show_ledger') {
      await TelegramApiClient.answerCallback(botToken, callbackId, `📊 Displaying net group matrix`);
      const expenses = await getGroupExpenses(chatId);
      await GroupPresenter.presentGroupBalanceMatrix(botToken, chatId, expenses);
    } else if (action === 'g_undo') {
      await TelegramApiClient.answerCallback(botToken, callbackId, `↩️ Rolled back expense!`);
      await handleGroupUndo(chatId);
    } else if (action === 'g_batch_confirm') {
      await TelegramApiClient.answerCallback(botToken, callbackId, `✅ Batch imported statement!`);
      await TelegramApiClient.sendMessage(botToken, chatId, `✅ **Group Bank Statement Batch Imported!** Logged into group ledger.`);
    } else if (action === 'g_cancel') {
      await TelegramApiClient.answerCallback(botToken, callbackId, `❌ Cancelled.`);
      await TelegramApiClient.sendMessage(botToken, chatId, `❌ Action cancelled.`);
    }
  }
}
