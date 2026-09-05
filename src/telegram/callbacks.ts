import { MongoDBClient } from '../db/mongodb';
import { ParsedTransactionResult } from '../services/ai';
import { AccountCallbacks } from './callbacks/accountCallbacks';
import { CategoryCallbacks } from './callbacks/categoryCallbacks';
import { TransactionCallbacks } from './callbacks/transactionCallbacks';

export interface TelegramApiContext {
  botToken: string;
  sendMessage: (chatId: number, text: string, options?: Record<string, any>) => Promise<void>;
  editMessage: (chatId: number, messageId: number, text: string, options?: Record<string, any>) => Promise<void>;
  answerCallback: (callbackQueryId: string, text: string) => Promise<void>;
  presentTransactionConfirmation: (
    chatId: number,
    parsed: ParsedTransactionResult,
    rawText: string,
    telegramMsgId: number,
    isVoice?: boolean,
    transcription?: string
  ) => Promise<void>;
}

export class CallbackQueryHandler {
  constructor(private db: MongoDBClient, private api: TelegramApiContext) {}

  async handle(cb: any): Promise<void> {
    const callbackId = cb.id;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data: string = cb.data || '';

    const parts = data.split(':');
    const action = parts[0];
    const txId = parts[1];

    switch (action) {
      // 1. Transaction Confirmation
      case 'tx_confirm':
        await TransactionCallbacks.handleConfirm(this.db, this.api, chatId, messageId, callbackId, txId);
        break;

      // 2. Group Expense Split Confirmation
      case 'split_confirm': {
        const totalAmount = parseFloat(parts[1]) || 0;
        const title = decodeURIComponent(parts[2] || 'Group Expense');
        await TransactionCallbacks.handleSplitConfirm(this.db, this.api, chatId, messageId, callbackId, totalAmount, title);
        break;
      }

      // 3. Batch Bank Statement Import Confirmation
      case 'batch_import_confirm':
        await TransactionCallbacks.handleBatchImportConfirm(this.api, chatId, messageId, callbackId);
        break;

      // 4. Edit Category
      case 'tx_edit_cat':
        await CategoryCallbacks.handleEditCategory(this.db, this.api, chatId, messageId, callbackId, txId);
        break;

      // 4b. Set Selected Category
      case 'tx_set_cat': {
        const newCat = decodeURIComponent(parts[2] || 'General');
        await CategoryCallbacks.handleSetCategory(this.db, this.api, chatId, messageId, callbackId, txId, newCat);
        break;
      }

      // 5. Person Merge Confirmation
      case 'person_merge': {
        const primaryPersonId = parts[2];
        const aliasToAdd = parts[3];
        await TransactionCallbacks.handlePersonMerge(this.db, this.api, chatId, messageId, callbackId, txId, primaryPersonId, aliasToAdd);
        break;
      }

      // 6. Interactive Account Selection Grid
      case 'tx_choose_acc':
        await AccountCallbacks.handleChooseAccount(this.db, this.api, chatId, messageId, callbackId, txId);
        break;

      // 6b. Set Account from Grid Selection
      case 'tx_set_acc': {
        const selectedAcc = decodeURIComponent(parts[2] || 'JazzCash');
        await AccountCallbacks.handleSetAccount(this.db, this.api, chatId, messageId, callbackId, txId, selectedAcc);
        break;
      }

      // 6c. Fallback Toggle Account
      case 'tx_toggle_acc':
        await AccountCallbacks.handleToggleAccount(this.db, this.api, chatId, messageId, callbackId, txId);
        break;

      // 7. Cancel Transaction
      case 'tx_cancel':
        await TransactionCallbacks.handleCancel(this.db, this.api, chatId, messageId, callbackId, txId);
        break;

      default:
        await this.api.answerCallback(callbackId, 'Action not recognized.');
    }
  }
}
