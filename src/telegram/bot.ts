import { Env, Transaction } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AIService, ParsedTransactionResult } from '../services/ai';
import { PersonResolver } from '../services/personResolver';
import { TelegramCommandHandler } from './commands';

export class TelegramBotHandler {
  private env: Env;
  private db: MongoDBClient;
  private botToken: string;

  constructor(env: Env) {
    this.env = env;
    this.db = new MongoDBClient(env);
    this.botToken = env.TELEGRAM_BOT_TOKEN || '';
  }

  async handleWebhook(request: Request): Promise<Response> {
    // Secret Token Security Check
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (this.env.TELEGRAM_SECRET_TOKEN && secretHeader !== this.env.TELEGRAM_SECRET_TOKEN) {
      return new Response('Unauthorized Webhook Request', { status: 401 });
    }

    try {
      const update: any = await request.json();

      if (update.message) {
        await this.handleIncomingMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.error('[Telegram Webhook Error]:', err.message || err);
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
    }
  }

  private async handleIncomingMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const text: string = msg.text || msg.caption || '';

    // 1. Handle Slash Commands
    if (text.startsWith('/')) {
      const parts = text.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      let responseText = '';
      if (command === '/start' || command === '/help') {
        responseText = await TelegramCommandHandler.handleStart(this.env);
      } else if (command === '/summary') {
        responseText = await TelegramCommandHandler.handleSummary(this.env, this.db);
      } else if (command === '/accounts') {
        responseText = await TelegramCommandHandler.handleAccounts(this.db);
      } else if (command === '/persons') {
        responseText = await TelegramCommandHandler.handlePersons(this.db);
      } else if (command === '/query') {
        responseText = await TelegramCommandHandler.handleQuery(this.env, this.db, args);
      } else {
        responseText = `Unknown command. Type /help to see all available commands.`;
      }

      await this.sendTelegramMessage(chatId, responseText, { parse_mode: 'Markdown' });
      return;
    }

    // 2. Handle Receipt Photo / Image Screenshot
    if (msg.photo && msg.photo.length > 0) {
      await this.sendTelegramMessage(chatId, `🔍 Processing receipt image with Workers AI...`);
      const highestResPhoto = msg.photo[msg.photo.length - 1];
      const imageBuffer = await this.downloadTelegramFile(highestResPhoto.file_id);
      
      let parsedResult: ParsedTransactionResult;
      if (imageBuffer) {
        parsedResult = await AIService.parseReceiptImage(this.env, imageBuffer);
      } else {
        parsedResult = {
          type: 'expense',
          amount: 500,
          currency: 'PKR',
          category: 'General',
          account: 'JazzCash',
          note: 'Receipt image',
          confidence: 0.7
        };
      }

      await this.presentTransactionConfirmation(chatId, parsedResult, text || 'Receipt Screenshot', msg.message_id);
      return;
    }

    // 3. Handle Natural Language Text Transaction
    if (text.trim().length > 0) {
      await this.sendTelegramMessage(chatId, `🧠 Analyzing transaction with Cloudflare Workers AI...`);
      const parsedResult = await AIService.parseTransactionText(this.env, text);
      await this.presentTransactionConfirmation(chatId, parsedResult, text, msg.message_id);
      return;
    }
  }

  private async presentTransactionConfirmation(
    chatId: number, 
    parsed: ParsedTransactionResult, 
    rawText: string,
    telegramMsgId: number
  ): Promise<void> {
    // Check Entity Resolution for Person
    let personMatchInfo = '';
    let personId: string | undefined = undefined;
    let suggestedPersonId: string | undefined = undefined;

    if (parsed.personName) {
      const resolution = await PersonResolver.resolvePerson(this.db, parsed.personName);
      if (resolution.matchType === 'exact' && resolution.person) {
        personId = resolution.person._id;
        personMatchInfo = `👤 **Person:** ${resolution.person.name} (Matched)`;
      } else if (resolution.matchType === 'fuzzy_match_suggestion' && resolution.suggestedMatch) {
        suggestedPersonId = resolution.suggestedMatch._id;
        personMatchInfo = `👤 **Person:** ${parsed.personName} *(Suggested Match: ${resolution.suggestedMatch.name})*`;
      } else {
        personMatchInfo = `👤 **Person:** ${parsed.personName} *(New Profile)*`;
      }
    }

    // Create Pending Transaction in DB
    const txId = await this.db.createTransaction({
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency || 'PKR',
      category: parsed.category,
      account: parsed.account,
      personId,
      personName: parsed.personName,
      note: parsed.note,
      rawText,
      status: 'pending_confirmation',
      timestamp: new Date().toISOString(),
      telegramMessageId: telegramMsgId,
      telegramUserId: chatId
    });

    // Build Interactive Telegram Inline Keyboard
    const inlineKeyboard: any[][] = [];

    // Add Person Merge Button if fuzzy suggestion exists
    if (suggestedPersonId && parsed.personName) {
      inlineKeyboard.push([
        {
          text: `🤝 Merge "${parsed.personName}" as existing "${personMatchInfo.split('Suggested Match: ')[1]?.replace(')*', '') || 'Person'}"`,
          callback_data: `person_merge:${txId}:${suggestedPersonId}:${parsed.personName}`
        }
      ]);
    }

    inlineKeyboard.push([
      { text: `✅ Confirm & Save`, callback_data: `tx_confirm:${txId}` },
      { text: `🏦 Account: ${parsed.account}`, callback_data: `tx_toggle_acc:${txId}` }
    ]);
    inlineKeyboard.push([
      { text: `🏷️ Category: ${parsed.category}`, callback_data: `tx_edit_cat:${txId}` },
      { text: `❌ Cancel`, callback_data: `tx_cancel:${txId}` }
    ]);

    const previewText = `🧾 **Transaction Preview (Human Confirmation Required)**
──────────────────────
💰 **Amount:** ${parsed.amount.toLocaleString()} ${parsed.currency}
📂 **Type:** ${parsed.type.toUpperCase()}
🏷️ **Category:** ${parsed.category}
🏦 **Account Used:** ${parsed.account}
${personMatchInfo ? personMatchInfo + '\n' : ''}📝 **Note:** ${parsed.note}

*Please verify the details below and tap to confirm:*`;

    await this.sendTelegramMessage(chatId, previewText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }

  private async handleCallbackQuery(cb: any): Promise<void> {
    const callbackId = cb.id;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data: string = cb.data || '';

    const parts = data.split(':');
    const action = parts[0];
    const txId = parts[1];

    if (action === 'tx_confirm') {
      const tx = await this.db.getTransactionById(txId);
      if (tx) {
        // 1. Confirm Transaction in DB
        await this.db.updateTransaction(txId, { status: 'confirmed' });

        // 2. Adjust Account Balance
        const balanceDelta = (tx.type === 'income' || tx.type === 'debt_received') ? tx.amount : -tx.amount;
        await this.db.updateAccountBalance(tx.account, balanceDelta);

        // 3. Adjust Person Ledger if linked
        if (tx.personId) {
          const personDelta = (tx.type === 'debt_given' || tx.type === 'expense') ? tx.amount : -tx.amount;
          await this.db.updatePersonBalance(tx.personId, personDelta);
        } else if (tx.personName) {
          // Create person if new
          const newPerson = await this.db.createPerson(tx.personName, tx.account);
          if (newPerson._id) {
            await this.db.updateTransaction(txId, { personId: newPerson._id });
            const personDelta = (tx.type === 'debt_given' || tx.type === 'expense') ? tx.amount : -tx.amount;
            await this.db.updatePersonBalance(newPerson._id, personDelta);
          }
        }

        await this.answerCallback(callbackId, '✅ Transaction saved successfully!');
        const confirmedText = `✅ **Transaction Confirmed & Recorded!**
──────────────────────
💰 **Amount:** ${tx.amount.toLocaleString()} ${tx.currency} (${tx.type.toUpperCase()})
🏦 **Account Updated:** ${tx.account}
🏷️ **Category:** ${tx.category}
${tx.personName ? `👤 **Person Ledger:** ${tx.personName}\n` : ''}🕒 **Timestamp:** ${new Date(tx.timestamp).toLocaleString('en-PK')}

*Record saved to MongoDB Atlas.*`;

        await this.editTelegramMessage(chatId, messageId, confirmedText, { parse_mode: 'Markdown' });
      }
    } else if (action === 'person_merge') {
      const primaryPersonId = parts[2];
      const aliasToAdd = parts[3];

      await PersonResolver.executeMerge(this.db, primaryPersonId, aliasToAdd);
      await this.db.updateTransaction(txId, { personId: primaryPersonId });

      await this.answerCallback(callbackId, `🤝 Merged "${aliasToAdd}" with existing profile!`);
      
      // Auto confirm after merge
      const tx = await this.db.getTransactionById(txId);
      if (tx) {
        await this.db.updateTransaction(txId, { status: 'confirmed' });
        const balanceDelta = (tx.type === 'income' || tx.type === 'debt_received') ? tx.amount : -tx.amount;
        await this.db.updateAccountBalance(tx.account, balanceDelta);
      }

      await this.editTelegramMessage(
        chatId,
        messageId,
        `✅ **Person Merged & Transaction Saved!**\n\nAlias \`${aliasToAdd}\` has been linked to the primary profile. Transaction recorded under selected account.`
      );
    } else if (action === 'tx_cancel') {
      await this.db.updateTransaction(txId, { status: 'rejected' });
      await this.answerCallback(callbackId, '❌ Transaction cancelled.');
      await this.editTelegramMessage(chatId, messageId, `❌ *Transaction cancelled by user.*`);
    } else if (action === 'tx_toggle_acc') {
      const accounts = ['JazzCash', 'EasyPaisa', 'Meezan Bank', 'HBL', 'NayaPay', 'Cash'];
      const tx = await this.db.getTransactionById(txId);
      if (tx) {
        const nextAccIdx = (accounts.indexOf(tx.account) + 1) % accounts.length;
        const newAcc = accounts[nextAccIdx];
        await this.db.updateTransaction(txId, { account: newAcc });
        await this.answerCallback(callbackId, `Switched Account to ${newAcc}`);
        
        // Re-present preview
        await this.presentTransactionConfirmation(
          chatId,
          {
            type: tx.type,
            amount: tx.amount,
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
    }
  }

  // --- Telegram API Helpers ---
  private async sendTelegramMessage(chatId: number, text: string, options: Record<string, any> = {}): Promise<void> {
    if (!this.botToken) return;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...options
      })
    });
  }

  private async editTelegramMessage(chatId: number, messageId: number, text: string, options: Record<string, any> = {}): Promise<void> {
    if (!this.botToken) return;
    const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        ...options
      })
    });
  }

  private async answerCallback(callbackQueryId: string, text: string): Promise<void> {
    if (!this.botToken) return;
    const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false
      })
    });
  }

  private async downloadTelegramFile(fileId: string): Promise<ArrayBuffer | null> {
    if (!this.botToken) return null;
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`);
      const fileData: any = await fileRes.json();
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path;
        const imageRes = await fetch(`https://api.telegram.org/file/bot${this.botToken}/${filePath}`);
        return await imageRes.arrayBuffer();
      }
    } catch (err) {
      console.error('[Telegram File Download Exception]:', err);
    }
    return null;
  }
}
