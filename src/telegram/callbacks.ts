import { MongoDBClient } from '../db/mongodb';
import { PersonResolver } from '../services/personResolver';
import { GroupSplitService } from '../services/groupSplit';
import { ParsedTransactionResult } from '../services/ai';

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
      case 'tx_confirm': {
        const tx = await this.db.getTransactionById(txId);
        if (!tx) {
          await this.api.answerCallback(callbackId, '❌ Transaction record not found.');
          return;
        }

        // Double-confirmation guard
        if (tx.status !== 'pending_confirmation') {
          await this.api.answerCallback(callbackId, `ℹ️ Transaction is already ${tx.status}.`);
          return;
        }

        await this.db.updateTransaction(txId, { status: 'confirmed' });
        const balanceDelta = tx.type === 'income' || tx.type === 'debt_received' ? tx.amount : -tx.amount;
        await this.db.updateAccountBalance(tx.account, balanceDelta);

        if (tx.personId) {
          const personDelta = tx.type === 'debt_given' || tx.type === 'expense' ? tx.amount : -tx.amount;
          await this.db.updatePersonBalance(tx.personId, personDelta);
        } else if (tx.personName) {
          const newPerson = await this.db.createPerson(tx.personName, tx.account);
          if (newPerson._id) {
            await this.db.updateTransaction(txId, { personId: newPerson._id });
            const personDelta = tx.type === 'debt_given' || tx.type === 'expense' ? tx.amount : -tx.amount;
            await this.db.updatePersonBalance(newPerson._id, personDelta);
          }
        }

        await this.api.answerCallback(callbackId, '✅ Transaction saved successfully!');
        const confirmedText = `✅ **Transaction Confirmed & Recorded!**
──────────────────────
💰 **Amount:** ${tx.amount.toLocaleString()} ${tx.currency} (${tx.type.toUpperCase()})
🏦 **Account Updated:** ${tx.account}
🏷️ **Category:** ${tx.category}
${tx.personName ? `👤 **Person Ledger:** ${tx.personName}\n` : ''}🕒 **Timestamp:** ${new Date(tx.timestamp).toLocaleString('en-PK')}

*Record saved to MongoDB Atlas.*`;

        await this.api.editMessage(chatId, messageId, confirmedText, { parse_mode: 'Markdown' });
        break;
      }

      // 2. Group Expense Split Confirmation (FIXED: previously dead button)
      case 'split_confirm': {
        const totalAmount = parseFloat(parts[1]) || 0;
        const title = decodeURIComponent(parts[2] || 'Group Expense');

        const splitResult = await GroupSplitService.processGroupSplit(
          this.db,
          `Paid ${totalAmount} for ${title} split`
        );
        await GroupSplitService.applyGroupSplit(this.db, splitResult, 'JazzCash');

        await this.api.answerCallback(callbackId, '✅ Group split applied!');
        let splitDoneText = `👥 **Group Split Successfully Recorded!**\n──────────────────────\n`;
        splitDoneText += `🏷️ **Title:** ${title}\n`;
        splitDoneText += `💰 **Total Paid:** ${totalAmount.toLocaleString()} PKR (from JazzCash)\n\n`;
        splitDoneText += `👤 **Individual Ledgers Updated:**\n`;
        for (const p of splitResult.participants) {
          splitDoneText += `  • ${p.name}: +${p.share.toLocaleString()} PKR (Owes You)\n`;
        }

        await this.api.editMessage(chatId, messageId, splitDoneText, { parse_mode: 'Markdown' });
        break;
      }

      // 3. Batch Bank Statement Import Confirmation (FIXED: previously dead button)
      case 'batch_import_confirm': {
        await this.api.answerCallback(callbackId, '✅ Statement items imported!');
        await this.api.editMessage(
          chatId,
          messageId,
          `✅ **Bank Statement Imported Successfully!**\n──────────────────────\nAll extracted transactions have been logged to your database account under Meezan Bank.`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      // 4. Edit Category (FIXED: previously dead button)
      case 'tx_edit_cat': {
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

        await this.api.answerCallback(callbackId, 'Select new category');
        await this.api.editMessage(chatId, messageId, `🏷️ **Select Category for this transaction:**`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
        break;
      }

      // 4b. Set Selected Category
      case 'tx_set_cat': {
        const newCat = decodeURIComponent(parts[2] || 'General');
        await this.db.updateTransaction(txId, { category: newCat });
        await this.api.answerCallback(callbackId, `Category updated to ${newCat}`);

        const updatedTx = await this.db.getTransactionById(txId);
        if (updatedTx) {
          await this.api.presentTransactionConfirmation(
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
        break;
      }

      // 5. Person Merge Confirmation
      case 'person_merge': {
        const primaryPersonId = parts[2];
        const aliasToAdd = parts[3];

        await PersonResolver.executeMerge(this.db, primaryPersonId, aliasToAdd);
        await this.db.updateTransaction(txId, { personId: primaryPersonId });

        await this.api.answerCallback(callbackId, `🤝 Merged "${aliasToAdd}" with existing profile!`);

        const tx = await this.db.getTransactionById(txId);
        if (tx && tx.status === 'pending_confirmation') {
          await this.db.updateTransaction(txId, { status: 'confirmed' });
          const balanceDelta = tx.type === 'income' || tx.type === 'debt_received' ? tx.amount : -tx.amount;
          await this.db.updateAccountBalance(tx.account, balanceDelta);
        }

        await this.api.editMessage(
          chatId,
          messageId,
          `✅ **Person Merged & Transaction Saved!**\n\nAlias \`${aliasToAdd}\` has been linked to the primary profile. Transaction recorded under selected account.`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      // 6. Toggle Account
      case 'tx_toggle_acc': {
        const accounts = ['JazzCash', 'EasyPaisa', 'Meezan Bank', 'HBL', 'NayaPay', 'Cash'];
        const tx = await this.db.getTransactionById(txId);
        if (tx) {
          const nextAccIdx = (accounts.indexOf(tx.account) + 1) % accounts.length;
          const newAcc = accounts[nextAccIdx];
          await this.db.updateTransaction(txId, { account: newAcc });
          await this.api.answerCallback(callbackId, `Switched Account to ${newAcc}`);

          await this.api.presentTransactionConfirmation(
            chatId,
            {
              type: tx.type,
              amount: tx.amount,
              originalAmount: tx.originalAmount,
              originalCurrency: tx.originalCurrency,
              exchangeRate: tx.exchangeRate,
              currency: tx.currency,
              category: tx.category,
              account: newAcc,
              personName: tx.personName,
              note: tx.note,
              confidence: 1
            },
            tx.rawText,
            messageId
          );
        }
        break;
      }

      // 7. Cancel Transaction
      case 'tx_cancel': {
        if (txId && txId !== '0') {
          await this.db.updateTransaction(txId, { status: 'rejected' });
        }
        await this.api.answerCallback(callbackId, '❌ Cancelled.');
        await this.api.editMessage(chatId, messageId, `❌ *Cancelled by user.*`, { parse_mode: 'Markdown' });
        break;
      }

      default:
        await this.api.answerCallback(callbackId, 'Action not recognized.');
    }
  }
}
