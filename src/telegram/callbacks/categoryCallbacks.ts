import { MongoDBClient } from '../../db/mongodb';
import { TelegramApiContext } from '../callbacks';

export class CategoryCallbacks {
  static async handleEditCategory(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string
  ): Promise<void> {
    const categories = [
      'Food & Dining',
      'Groceries',
      'Bills & Utilities',
      'Transportation',
      'Shopping',
      'General'
    ];
    const keyboard = categories.map(cat => [
      { text: cat, callback_data: `tx_set_cat:${txId}:${encodeURIComponent(cat)}` }
    ]);

    await api.answerCallback(callbackId, 'Select new category');
    await api.editMessage(chatId, messageId, `🏷️ **Select Category for this transaction:**`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  static async handleSetCategory(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string,
    newCat: string
  ): Promise<void> {
    await db.updateTransaction(txId, { category: newCat });
    await api.answerCallback(callbackId, `Category updated to ${newCat}`);

    const updatedTx = await db.getTransactionById(txId);
    if (updatedTx) {
      await api.presentTransactionConfirmation(
        chatId,
        {
          type: updatedTx.type,
          amount: updatedTx.amount,
          originalAmount: updatedTx.originalAmount,
          originalCurrency: updatedTx.originalCurrency,
          exchangeRate: updatedTx.exchangeRate,
          currency: updatedTx.currency,
          category: newCat,
          account: updatedTx.account,
          personName: updatedTx.personName,
          note: updatedTx.note,
          confidence: 1
        },
        updatedTx.rawText,
        messageId
      );
    }
  }
}
