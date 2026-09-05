import { MongoDBClient } from '../../db/mongodb';
import { AccountService } from '../../services/accountService';
import { TelegramApiClient } from '../client/telegramApi';
import { TelegramApiContext } from '../callbacks';

export class AccountCallbacks {
  static async handleChooseAccount(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string
  ): Promise<void> {
    const tx = await db.getTransactionById(txId);
    if (!tx) {
      await api.answerCallback(callbackId, '❌ Transaction record not found.');
      return;
    }

    // Dynamically pull all registered accounts from MongoDB
    const registeredAccounts = await db.getAllAccounts();
    const accounts = registeredAccounts.length > 0 
      ? registeredAccounts.map(a => a.name)
      : ['JazzCash', 'EasyPaisa', 'Meezan Bank', 'HBL', 'NayaPay', 'Cash'];

    const keyboard: any[][] = [];
    let currentRow: any[] = [];

    for (const acc of accounts) {
      const emoji = AccountService.getAccountEmoji(acc);
      currentRow.push({
        text: `${emoji} ${acc}`,
        callback_data: `tx_set_acc:${txId}:${encodeURIComponent(acc)}`
      });
      if (currentRow.length === 3) {
        keyboard.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) keyboard.push(currentRow);

    keyboard.push([
      { text: `🔙 Keep Current (${tx.account})`, callback_data: `tx_set_acc:${txId}:${encodeURIComponent(tx.account)}` }
    ]);

    await api.answerCallback(callbackId, 'Select Payment Account');
    await api.editMessage(
      chatId,
      messageId,
      `🏦 **Select Payment Account / Wallet:**\nCurrent Account: **${tx.account}**`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  }

  static async handleSetAccount(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string,
    selectedAcc: string
  ): Promise<void> {
    await db.updateTransaction(txId, { account: selectedAcc });
    await api.answerCallback(callbackId, `Switched to ${selectedAcc}`);

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
          category: updatedTx.category,
          account: selectedAcc,
          personName: updatedTx.personName,
          note: updatedTx.note,
          confidence: 1
        },
        updatedTx.rawText,
        messageId
      );
    }
  }

  static async handleToggleAccount(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string
  ): Promise<void> {
    const registered = await db.getAllAccounts();
    const accounts = registered.length > 0 ? registered.map(a => a.name) : ['JazzCash', 'EasyPaisa', 'Meezan Bank', 'Cash'];
    const tx = await db.getTransactionById(txId);
    if (tx) {
      const nextAccIdx = (accounts.indexOf(tx.account) + 1) % accounts.length;
      const newAcc = accounts[nextAccIdx];
      await this.handleSetAccount(db, api, chatId, messageId, callbackId, txId, newAcc);
    }
  }
}
