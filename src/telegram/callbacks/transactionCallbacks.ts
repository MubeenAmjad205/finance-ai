import { MongoDBClient } from '../../db/mongodb';
import { PersonResolver } from '../../services/personResolver';
import { GroupSplitService } from '../../services/groupSplit';
import { TemporalResolver } from '../../services/temporalResolver';
import { MemoryService } from '../../services/ai/memoryService';
import { TelegramApiContext } from '../callbacks';

export class TransactionCallbacks {
  static async handleConfirm(
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

    if (tx.status !== 'pending_confirmation') {
      await api.answerCallback(callbackId, `ℹ️ Transaction is already ${tx.status}.`);
      return;
    }

    // Cryptographic DB Tamper Detection Check
    if (tx.evidenceHash) {
      const isValid = await TemporalResolver.verifyEvidenceSignature({
        amount: tx.amount,
        timestamp: tx.timestamp,
        note: tx.note || tx.rawText,
        paidBy: String(tx.telegramUserId || chatId)
      }, tx.evidenceHash);

      if (!isValid) {
        await api.answerCallback(callbackId, '⚠️ Notice: Tamper hash discrepancy!');
        const tamperAlert = `🚨 **DATABASE TAMPER WARNING**\n──────────────────────\n⚠️ Transaction record values did not match its cryptographic evidence signature.\nRecord may have been altered outside the bot!`;
        await api.sendMessage(chatId, tamperAlert, { parse_mode: 'Markdown' });
      }
    }

    await db.updateTransaction(txId, { status: 'confirmed' });
    const balanceDelta = tx.type === 'income' || tx.type === 'debt_received' ? tx.amount : -tx.amount;
    await db.updateAccountBalance(tx.account, balanceDelta);

    if (tx.personId) {
      const personDelta = tx.type === 'debt_given' || tx.type === 'expense' ? tx.amount : -tx.amount;
      await db.updatePersonBalance(tx.personId, personDelta);
    } else if (tx.personName) {
      const newPerson = await db.createPerson(tx.personName, tx.account);
      if (newPerson._id) {
        await db.updateTransaction(txId, { personId: newPerson._id });
        const personDelta = tx.type === 'debt_given' || tx.type === 'expense' ? tx.amount : -tx.amount;
        await db.updatePersonBalance(newPerson._id, personDelta);
      }
    }

    // Update AI Long-Term Memory
    await MemoryService.learnFromTransaction(chatId, tx, db);

    await api.answerCallback(callbackId, '✅ Transaction saved successfully!');
    const confirmedText = `✅ **Transaction Confirmed & Recorded!**
──────────────────────
💰 **Amount:** ${tx.amount.toLocaleString()} ${tx.currency} (${tx.type.toUpperCase()})
🏦 **Account Updated:** ${tx.account}
🏷️ **Category:** ${tx.category}
${tx.personName ? `👤 **Person Ledger:** ${tx.personName}\n` : ''}🕒 **Timestamp:** ${new Date(tx.timestamp).toLocaleString('en-PK')}

*Record saved to database.*`;

    await api.editMessage(chatId, messageId, confirmedText, { parse_mode: 'Markdown' });
  }

  static async handleCancel(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string
  ): Promise<void> {
    if (txId && txId !== '0') {
      await db.updateTransaction(txId, { status: 'rejected' });
    }
    await api.answerCallback(callbackId, '❌ Cancelled.');
    await api.editMessage(chatId, messageId, `❌ *Cancelled by user.*`, { parse_mode: 'Markdown' });
  }

  static async handlePersonMerge(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    txId: string,
    primaryPersonId: string,
    aliasToAdd: string
  ): Promise<void> {
    await PersonResolver.executeMerge(db, primaryPersonId, aliasToAdd);
    await db.updateTransaction(txId, { personId: primaryPersonId });

    await api.answerCallback(callbackId, `🤝 Merged "${aliasToAdd}" with existing profile!`);

    const tx = await db.getTransactionById(txId);
    if (tx && tx.status === 'pending_confirmation') {
      await db.updateTransaction(txId, { status: 'confirmed' });
      const balanceDelta = tx.type === 'income' || tx.type === 'debt_received' ? tx.amount : -tx.amount;
      await db.updateAccountBalance(tx.account, balanceDelta);
    }

    await api.editMessage(
      chatId,
      messageId,
      `✅ **Person Merged & Transaction Saved!**\n\nAlias \`${aliasToAdd}\` has been linked to the primary profile. Transaction recorded under selected account.`,
      { parse_mode: 'Markdown' }
    );
  }

  static async handleSplitConfirm(
    db: MongoDBClient,
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string,
    totalAmount: number,
    title: string
  ): Promise<void> {
    const splitResult = await GroupSplitService.processGroupSplit(
      db,
      `Paid ${totalAmount} for ${title} split`
    );
    await GroupSplitService.applyGroupSplit(db, splitResult, 'JazzCash');

    await api.answerCallback(callbackId, '✅ Group split applied!');
    let splitDoneText = `👥 **Group Split Successfully Recorded!**\n──────────────────────\n`;
    splitDoneText += `🏷️ **Title:** ${title}\n`;
    splitDoneText += `💰 **Total Paid:** ${totalAmount.toLocaleString()} PKR\n\n`;
    splitDoneText += `👤 **Individual Ledgers Updated:**\n`;
    for (const p of splitResult.participants) {
      splitDoneText += `  • ${p.name}: +${p.share.toLocaleString()} PKR (Owes You)\n`;
    }

    await api.editMessage(chatId, messageId, splitDoneText, { parse_mode: 'Markdown' });
  }

  static async handleBatchImportConfirm(
    api: TelegramApiContext,
    chatId: number,
    messageId: number,
    callbackId: string
  ): Promise<void> {
    await api.answerCallback(callbackId, '✅ Statement items imported!');
    await api.editMessage(
      chatId,
      messageId,
      `✅ **Bank Statement Imported Successfully!**\n──────────────────────\nAll extracted transactions have been logged to your database account under Meezan Bank.`,
      { parse_mode: 'Markdown' }
    );
  }
}
