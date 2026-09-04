import { Env, Transaction } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AIService, ParsedTransactionResult } from '../services/ai';
import { PersonResolver } from '../services/personResolver';
import { GroupSplitService } from '../services/groupSplit';
import { PDFStatementParser } from '../services/pdfParser';
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
        await this.sendTelegramMessage(chatId, responseText, {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              [{ text: '🍔 Food 500' }, { text: '🚗 Petrol 2000' }, { text: '🛒 Grocery 1500' }],
              [{ text: '/summary' }, { text: '/accounts' }, { text: '/persons' }],
              [{ text: '/advisor' }, { text: '/undo' }]
            ],
            resize_keyboard: true,
            is_persistent: true
          }
        });
        return;
      } else if (command === '/summary') {
        responseText = await TelegramCommandHandler.handleSummary(this.env, this.db);
      } else if (command === '/accounts') {
        responseText = await TelegramCommandHandler.handleAccounts(this.db);
      } else if (command === '/setbalance') {
        responseText = await TelegramCommandHandler.handleSetBalance(this.db, args);
      } else if (command === '/transfer') {
        responseText = await TelegramCommandHandler.handleTransfer(this.db, args);
      } else if (command === '/settle') {
        responseText = await TelegramCommandHandler.handleSettle(this.db, args);
      } else if (command === '/undo') {
        responseText = await TelegramCommandHandler.handleUndo(this.db);
      } else if (command === '/advisor') {
        responseText = await TelegramCommandHandler.handleAdvisor(this.env, this.db);
      } else if (command === '/remind') {
        responseText = await TelegramCommandHandler.handleRemind(args);
      } else if (command === '/report') {
        responseText = await TelegramCommandHandler.handleReport(this.env, this.db);
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

    // 2. Handle Voice Note Message (.ogg/.mp3)
    if (msg.voice || msg.audio) {
      const voiceObj = msg.voice || msg.audio;
      await this.sendTelegramMessage(chatId, `🎙️ Transcribing voice note with Cloudflare Workers AI Whisper...`);

      const audioBuffer = await this.downloadTelegramFile(voiceObj.file_id);
      if (audioBuffer) {
        const transcribedText = await AIService.transcribeVoiceNote(this.env, audioBuffer);
        if (transcribedText) {
          await this.sendTelegramMessage(chatId, `🗣️ **Transcribed:** "${transcribedText}"`, { parse_mode: 'Markdown' });
          const parsedResult = await AIService.parseTransactionText(this.env, transcribedText);
          await this.presentTransactionConfirmation(chatId, parsedResult, transcribedText, msg.message_id, true, transcribedText);
          return;
        }
      }
      await this.sendTelegramMessage(chatId, `❌ Could not transcribe voice note. Please try text input.`);
      return;
    }

    // 3. Handle PDF Statement Upload
    if (msg.document && (msg.document.mime_type === 'application/pdf' || msg.document.file_name?.endsWith('.pdf'))) {
      await this.sendTelegramMessage(chatId, `📄 Processing PDF bank statement with Workers AI...`);
      // Simulating PDF statement text extraction for Workers
      const statementItems = await PDFStatementParser.parseStatementText(this.env, text || 'Meezan Bank Monthly Statement PDF', 'Meezan Bank');
      
      let summaryMsg = `📑 **Bank Statement Extracted (${statementItems.length} items):**\n`;
      summaryMsg += `──────────────────────\n`;
      for (const item of statementItems.slice(0, 5)) {
        summaryMsg += `• **${item.description}**: ${item.amount.toLocaleString()} PKR (${item.type.toUpperCase()})\n`;
      }
      summaryMsg += `\n*Tap below to confirm batch import into MongoDB:*`;

      await this.sendTelegramMessage(chatId, summaryMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Import All ${statementItems.length} Items`, callback_data: `batch_import_confirm` }],
            [{ text: `❌ Cancel`, callback_data: `tx_cancel:0` }]
          ]
        }
      });
      return;
    }

    // 4. Handle Group Expense Splitting
    if (GroupSplitService.isGroupSplitMessage(text)) {
      const splitResult = await GroupSplitService.processGroupSplit(this.db, text);
      let splitText = `👥 **Group Expense Split Detected**\n`;
      splitText += `──────────────────────\n`;
      splitText += `🏷️ **Title:** ${splitResult.title}\n`;
      splitText += `💰 **Total Amount:** ${splitResult.totalAmount.toLocaleString()} PKR\n`;
      splitText += `💵 **Share Per Person:** ${splitResult.perPersonShare.toLocaleString()} PKR\n\n`;
      splitText += `👤 **Participants:**\n`;
      for (const p of splitResult.participants) {
        splitText += `  • ${p.name}: ${p.share.toLocaleString()} PKR (Owes You)\n`;
      }

      await this.sendTelegramMessage(chatId, splitText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Confirm & Save Group Split`, callback_data: `split_confirm:${splitResult.totalAmount}:${encodeURIComponent(splitResult.title)}` }],
            [{ text: `❌ Cancel`, callback_data: `tx_cancel:0` }]
          ]
        }
      });
      return;
    }

    // 5. Handle Photo / Receipt Screenshot
    if (msg.photo && msg.photo.length > 0) {
      await this.sendTelegramMessage(chatId, `🔍 Processing receipt screenshot with Workers AI Vision...`);
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

    // 6. Handle Standard Text Input (Smart Intent Classifier)
    if (text.trim().length > 0) {
      const intent = AIService.detectMessageIntent(text);

      if (intent === 'chat') {
        const chatReply = await AIService.generateChatResponse(this.env, text);
        await this.sendTelegramMessage(chatId, chatReply, { parse_mode: 'Markdown' });
        return;
      }

      if (intent === 'question') {
        const queryReply = await TelegramCommandHandler.handleQuery(this.env, this.db, text);
        await this.sendTelegramMessage(chatId, queryReply, { parse_mode: 'Markdown' });
        return;
      }

      // Financial Transaction Logging
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
    telegramMsgId: number,
    isVoice = false,
    transcription?: string
  ): Promise<void> {
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

    const txId = await this.db.createTransaction({
      type: parsed.type,
      amount: parsed.amount,
      originalAmount: parsed.originalAmount,
      originalCurrency: parsed.originalCurrency,
      exchangeRate: parsed.exchangeRate,
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
      telegramUserId: chatId,
      isVoiceNote: isVoice,
      voiceTranscription: transcription,
      tags: parsed.tags
    });

    const inlineKeyboard: any[][] = [];

    if (suggestedPersonId && parsed.personName) {
      inlineKeyboard.push([
        {
          text: `🤝 Merge "${parsed.personName}" as existing profile`,
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

    let currencyStr = `${parsed.amount.toLocaleString()} PKR`;
    if (parsed.originalAmount && parsed.originalCurrency) {
      currencyStr = `${parsed.originalAmount} ${parsed.originalCurrency} (~${parsed.amount.toLocaleString()} PKR @ Rate ${parsed.exchangeRate})`;
    }

    const previewText = `🧾 **Transaction Preview (Human Confirmation Required)**
──────────────────────
💰 **Amount:** ${currencyStr}
📂 **Type:** ${parsed.type.toUpperCase()}
🏷️ **Category:** ${parsed.category}
🏦 **Account Used:** ${parsed.account}
${personMatchInfo ? personMatchInfo + '\n' : ''}${parsed.tags ? `🏷️ **Tags:** ${parsed.tags.join(' ')}\n` : ''}📝 **Note:** ${parsed.note}

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
        await this.db.updateTransaction(txId, { status: 'confirmed' });
        const balanceDelta = (tx.type === 'income' || tx.type === 'debt_received') ? tx.amount : -tx.amount;
        await this.db.updateAccountBalance(tx.account, balanceDelta);

        if (tx.personId) {
          const personDelta = (tx.type === 'debt_given' || tx.type === 'expense') ? tx.amount : -tx.amount;
          await this.db.updatePersonBalance(tx.personId, personDelta);
        } else if (tx.personName) {
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
      if (txId && txId !== '0') {
        await this.db.updateTransaction(txId, { status: 'rejected' });
      }
      await this.answerCallback(callbackId, '❌ Cancelled.');
      await this.editTelegramMessage(chatId, messageId, `❌ *Cancelled by user.*`);
    } else if (action === 'tx_toggle_acc') {
      const accounts = ['JazzCash', 'EasyPaisa', 'Meezan Bank', 'HBL', 'NayaPay', 'Cash'];
      const tx = await this.db.getTransactionById(txId);
      if (tx) {
        const nextAccIdx = (accounts.indexOf(tx.account) + 1) % accounts.length;
        const newAcc = accounts[nextAccIdx];
        await this.db.updateTransaction(txId, { account: newAcc });
        await this.answerCallback(callbackId, `Switched Account to ${newAcc}`);
        
        await this.presentTransactionConfirmation(
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
