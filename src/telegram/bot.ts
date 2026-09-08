import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AIService, ParsedTransactionResult } from '../services/ai';
import { GroupSplitService } from '../services/groupSplit';
import { PDFStatementParser } from '../services/pdfParser';
import { TelegramCommandHandler } from './commands';
import { TelegramGroupBotHandler } from './groupBot';
import { CallbackQueryHandler } from './callbacks';
import { TelegramAuthGuard } from './guards/authGuard';
import { ConversationStateManager } from '../services/ai/conversationState';
import { BudgetAlertService } from '../services/budgetAlerts';
import { MemoryService } from '../services/ai/memoryService';
import { TelegramApiClient } from './client/telegramApi';
import { TxPresenter } from './handlers/txPresenter';
import { VoiceHandler } from './handlers/voiceHandler';
import { PhotoHandler } from './handlers/photoHandler';
import { WhitelistCommands } from './commands/whitelistCommands';
import { AccountService } from '../services/accountService';
import { getUserCurrentMonth, DEFAULT_USER_TIMEZONE } from '../utils/timezone';

export class TelegramBotHandler {
  private env: Env;
  private db: MongoDBClient;
  private botToken: string;
  private callbacks: CallbackQueryHandler;

  constructor(env: Env) {
    this.env = env;
    this.db = new MongoDBClient(env);
    this.botToken = env.TELEGRAM_BOT_TOKEN || '';

    this.callbacks = new CallbackQueryHandler(this.db, {
      botToken: this.botToken,
      sendMessage: (chatId, text, opts) => TelegramApiClient.sendMessage(this.botToken, chatId, text, opts).then(() => {}),
      editMessage: (chatId, messageId, text, opts) => TelegramApiClient.editMessage(this.botToken, chatId, messageId, text, opts).then(() => {}),
      answerCallback: (cbId, text) => TelegramApiClient.answerCallback(this.botToken, cbId, text).then(() => {}),
      presentTransactionConfirmation: (cId, p, r, m, v, t) =>
        TxPresenter.presentTransactionConfirmation(this.botToken, this.db, cId, p, r, m, v, t)
    }, this.env);
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
      } else if (update.edited_message) {
        await this.handleEditedMessage(update.edited_message);
      } else if (update.callback_query) {
        await this.callbacks.handle(update.callback_query);
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
    const chatType = msg.chat?.type;
    const text: string = msg.text || msg.caption || '';

    // Auto-delegate group chats or group commands to TelegramGroupBotHandler
    const rawCmd = text.trim().split(/\s+/)[0]?.toLowerCase() || '';
    const isGroupCmd = rawCmd.startsWith('/group') || rawCmd.startsWith('/ledger') || rawCmd.startsWith('/member');
    if (chatType === 'group' || chatType === 'supergroup' || isGroupCmd) {
      const groupHandler = new TelegramGroupBotHandler(this.env);
      await groupHandler.handleGroupMessage(msg);
      return;
    }

    // 0. Whitelist / User Authorization Check
    const fromId = msg.from?.id;
    const authCheck = await TelegramAuthGuard.isAuthorizedAsync(this.env, this.db, fromId, chatId);
    if (!authCheck.isAuthorized) {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📩 Request Access from Owner', callback_data: `auth_req:${fromId}` }]
        ]
      };
      await TelegramApiClient.sendMessage(
        this.botToken,
        chatId,
        `🔒 *Access Restricted*\n\n` +
        `This personal finance assistant is configured for private use.\n` +
        `Your Telegram User ID: \`${fromId}\`\n\n` +
        `If you know the owner, you can request access below:`,
        { reply_markup: keyboard, parse_mode: 'Markdown' }
      );
      return;
    }

    // Record turn in short-term working memory
    if (text) MemoryService.recordTurn(chatId, 'user', text);

    // 1. Handle Slash Commands
    if (text.startsWith('/')) {
      await this.dispatchSlashCommand(chatId, text, fromId, msg.from?.first_name);
      return;
    }

    // 2. Handle Voice Note
    if (msg.voice || msg.audio) {
      await VoiceHandler.handleVoiceNote(
        this.env,
        this.botToken,
        this.db,
        chatId,
        msg,
        async (transcribed) => this.handleTextMessage(chatId, transcribed, msg.message_id)
      );
      return;
    }

    // 3. Handle PDF Statement Upload
    if (msg.document && (msg.document.mime_type === 'application/pdf' || msg.document.file_name?.endsWith('.pdf'))) {
      await this.handleDocument(chatId, text);
      return;
    }

    // 4. Handle Group Expense Splitting in Direct Chat
    if (GroupSplitService.isGroupSplitMessage(text)) {
      await this.handleGroupSplitText(chatId, text);
      return;
    }

    // 5. Handle Photo / Receipt Screenshot
    if (msg.photo && msg.photo.length > 0) {
      await PhotoHandler.handlePhotoReceipt(this.env, this.botToken, this.db, chatId, msg, text);
      return;
    }

    // 6. Handle Standard Text Input (Intent Classifier & Multi-Turn Memory)
    if (text.trim().length > 0) {
      await this.handleTextMessage(chatId, text, msg.message_id);
    }
  }

  private async dispatchSlashCommand(chatId: number, text: string, fromId?: number | string, senderName?: string): Promise<void> {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase().split('@')[0];
    const args = parts.slice(1).join(' ');

    let responseText = '';
    if (command === '/start' || command === '/help') {
      responseText = await TelegramCommandHandler.handleStart(this.env);
      await TelegramApiClient.sendMessage(this.botToken, chatId, responseText, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '🍔 Food 500' }, { text: '🚗 Petrol 2000' }, { text: '🛒 Grocery 1500' }],
            [{ text: '/summary' }, { text: '/accounts' }, { text: '/persons' }],
            [{ text: '/kameti' }, { text: '/export' }, { text: '/undo' }]
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
    } else if (command === '/setlimit') {
      responseText = await TelegramCommandHandler.handleSetLimit(this.db, args);
    } else if (command === '/paylink') {
      responseText = await TelegramCommandHandler.handlePaylink(this.db, args);
    } else if (command === '/goals') {
      responseText = await TelegramCommandHandler.handleGoals(this.db, args);
    } else if (command === '/settle') {
      responseText = await TelegramCommandHandler.handleSettle(this.db, args);
    } else if (command === '/undo') {
      responseText = await TelegramCommandHandler.handleUndo(this.db);
    } else if (command === '/advisor') {
      responseText = await TelegramCommandHandler.handleAdvisor(this.env, this.db);
    } else if (command === '/remind') {
      responseText = await TelegramCommandHandler.handleRemind(this.db, args, chatId);
    } else if (command === '/report') {
      responseText = await TelegramCommandHandler.handleReport(this.env, this.db);
    } else if (command === '/persons') {
      responseText = await TelegramCommandHandler.handlePersons(this.db);
    } else if (command === '/export') {
      responseText = await TelegramCommandHandler.handleExport(this.db, args, chatId, this.botToken);
    } else if (command === '/kameti') {
      responseText = await TelegramCommandHandler.handleKameti(this.db, args);
    } else if (command === '/query') {
      responseText = await TelegramCommandHandler.handleQuery(this.env, this.db, args);
    } else if (command === '/runway') {
      responseText = await TelegramCommandHandler.handleRunway(this.db);
    } else if (command === '/health') {
      responseText = await TelegramCommandHandler.handleHealth(this.db);
    } else if (command === '/digest') {
      responseText = await TelegramCommandHandler.handleDigest(this.db);
    } else if (command === '/recap') {
      responseText = await TelegramCommandHandler.handleRecap(this.db);
    } else if (command === '/projection' || command === '/payday') {
      responseText = await TelegramCommandHandler.handleProjection(this.db);
    } else if (command === '/whitelist') {
      responseText = await WhitelistCommands.handlePersonalWhitelist(this.db, this.env, args, fromId || chatId, senderName);
    } else {
      responseText = `Unknown command. Type /help to see all available commands.`;
    }

    await TelegramApiClient.sendMessage(this.botToken, chatId, responseText, { parse_mode: 'Markdown' });
  }

  private async handleTextMessage(chatId: number, text: string, messageId: number): Promise<void> {
    const correction = ConversationStateManager.detectCorrection(text);
    if (correction.isCorrection) {
      if (correction.isCancel) {
        const undoMsg = await TelegramCommandHandler.handleUndo(this.db);
        await TelegramApiClient.sendMessage(this.botToken, chatId, `↩️ **Natural Text Correction Executed:**\n\n${undoMsg}`, { parse_mode: 'Markdown' });
        return;
      }
    }

    const resolvedFollowUp = ConversationStateManager.resolveFollowUp(chatId, text);
    const effectiveText = resolvedFollowUp || text;

    // Check if the user is providing their account number, mobile wallet, IBAN or Raast ID
    const lowerText = effectiveText.toLowerCase();
    const isSpending = lowerText.includes('spent') || lowerText.includes('paid') || lowerText.includes('send') || lowerText.includes('sent') || lowerText.includes('transfer') || lowerText.includes('kharcha') || lowerText.includes('diye') || lowerText.includes('bought');

    if (!isSpending) {
      const detectedInst = AccountService.detectAccount(effectiveText);
      const phoneOrIbanMatch = effectiveText.match(/(?:account\s*(?:no|num|number)?|number|id|iban)?\s*(?:is|:)?\s*(\b03\d{9}\b|\b\d{10,16}\b|[A-Z]{2}\d{2}[A-Z0-9]{16,24})/i);

      if (detectedInst && phoneOrIbanMatch) {
        const accNum = phoneOrIbanMatch[1];
        const existingAccounts = await this.db.getAllAccounts();
        const existing = existingAccounts.find(a => a.name.toLowerCase() === detectedInst.name.toLowerCase());
        if (!existing) {
          await this.db.accounts.create({
            name: detectedInst.name,
            balance: 0,
            type: detectedInst.type,
            currency: 'PKR',
            updatedAt: new Date().toISOString()
          });
        }
        MemoryService.addCustomNote(chatId, `${detectedInst.name} Account: ${accNum}`, this.db);

        const confirmationMsg = `🏦 **${detectedInst.name} Account Saved!**\n──────────────────────\n` +
          `📱 **Account Number:** \`${accNum}\`\n` +
          `💾 *Saved to your personal profile for payment links & recordkeeping.*\n\n` +
          `💡 *Current Balance:* \`${existing ? existing.balance : 0} PKR\`\n` +
          `To set your starting balance, type:\n\`/setbalance ${detectedInst.name} <amount>\``;

        await TelegramApiClient.sendMessage(this.botToken, chatId, confirmationMsg, { parse_mode: 'Markdown' });
        MemoryService.recordTurn(chatId, 'assistant', confirmationMsg);
        return;
      }
    }

    // Check if the user is naturally setting or updating an account balance (e.g. from voice note or text)
    // Examples: "Add may new UBL account with initial balance of 1000", "Set UBL account balance 1000", "Update EasyPaisa balance to 500"
    const isSetBalancePattern = !isSpending && (
      /(?:add|set|update|change|initialize|open|create)\s+(?:my\s+|may\s+)?(?:new\s+)?(?:account\s+)?([a-zA-Z\s]+?)\s*(?:account)?\s*(?:with\s+)?(?:initial\s+|starting\s+)?balance\s*(?:of|to|as|is|:)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i.test(effectiveText) ||
      /(?:set|update|change|initialize)\s+(?:my\s+)?(?:account\s+)?(?:balance|starting\s+balance)?/i.test(effectiveText) ||
      /(?:balance|balance\s+is|balance\s+to)\s*(?:is|to|:)?\s*\d+/i.test(effectiveText)
    );

    if (isSetBalancePattern) {
      const detectedInst = AccountService.detectAccount(effectiveText);
      const amountMatch = effectiveText.match(/(\b\d+(?:,\d+)*(?:\.\d+)?\b)/);
      if (detectedInst && amountMatch) {
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount >= 0) {
          const responseText = await TelegramCommandHandler.handleSetBalance(this.db, `${detectedInst.name} ${amount}`);
          await TelegramApiClient.sendMessage(this.botToken, chatId, responseText, { parse_mode: 'Markdown' });
          MemoryService.recordTurn(chatId, 'assistant', responseText);
          return;
        }
      }
    }

    const intent = AIService.detectMessageIntent(effectiveText);

    if (intent === 'chat') {
      const greeting = await AIService.generateChatResponse(this.env, effectiveText);
      await TelegramApiClient.sendMessage(this.botToken, chatId, greeting, { parse_mode: 'Markdown' });
      MemoryService.recordTurn(chatId, 'assistant', greeting);
      return;
    }

    if (intent === 'question') {
      const userTz = this.env.USER_TIMEZONE || DEFAULT_USER_TIMEZONE;
      const currentMonth = getUserCurrentMonth(userTz);
      const [stats, accounts, persons] = await Promise.all([
        this.db.getMonthlyStats(currentMonth),
        this.db.getAllAccounts(),
        this.db.getAllPersons()
      ]);
      const memoryCtx = await MemoryService.getStructuredMemoryContext(chatId, this.db);
      
      const accountsSummary = accounts.length > 0
        ? accounts.map(a => `• ${a.name}: ${a.balance.toLocaleString()} ${a.currency || 'PKR'}`).join('\n')
        : '• No accounts configured yet (use /setbalance to add)';

      const netSavings = stats.totalIncome - stats.totalExpense;
      const context = `[ACCOUNT BALANCES]\n${accountsSummary}\n\n[MONTHLY STATS FOR ${currentMonth}]\n- Total Income: ${stats.totalIncome} PKR\n- Total Expenses: ${stats.totalExpense} PKR\n- Net Savings: ${netSavings} PKR\n- Spending Categories: ${JSON.stringify(stats.categoryBreakdown)}\n\n${memoryCtx}`;

      const answer = await AIService.answerFinancialQuery(this.env, effectiveText, context);
      await TelegramApiClient.sendMessage(this.botToken, chatId, answer, { parse_mode: 'Markdown' });
      MemoryService.recordTurn(chatId, 'assistant', answer);
      return;
    }

    const slotCheck = ConversationStateManager.checkMissingSlots(effectiveText);
    if (slotCheck.isPartial && slotCheck.missingSlot) {
      ConversationStateManager.savePendingSlot(chatId, effectiveText, slotCheck.missingSlot);
      const isUrdu = AIService.detectLanguage(effectiveText) === 'roman_urdu';
      const prompt = slotCheck.missingSlot === 'amount'
        ? (isUrdu ? `🤔 Yeh kharcha kitne rupay ka tha? (e.g. *1500* bhej dein)` : `🤔 How much was this expense? (e.g. reply with *1500*)`)
        : (isUrdu ? `🤔 Yeh kharcha kis cheez ka tha aur kis account se? (e.g. *\"Groceries via JazzCash\"*)` : `🤔 What was this spent on and via which account?`);
      await TelegramApiClient.sendMessage(this.botToken, chatId, prompt, { parse_mode: 'Markdown' });
      MemoryService.recordTurn(chatId, 'assistant', prompt);
      return;
    }

    const compoundItems = await AIService.parseCompoundExpenses(this.env, effectiveText, chatId, this.db);
    if (compoundItems.length > 1) {
      for (const item of compoundItems) {
        const parsedItem = await AIService.parseTransactionText(this.env, `${item.note} ${item.amount}`, chatId, this.db);
        if (parsedItem.type === 'set_balance') {
          const responseText = await TelegramCommandHandler.handleSetBalance(this.db, `${parsedItem.account} ${parsedItem.amount}`);
          await TelegramApiClient.sendMessage(this.botToken, chatId, responseText, { parse_mode: 'Markdown' });
          MemoryService.recordTurn(chatId, 'assistant', responseText);
          return;
        }
        await TxPresenter.presentTransactionConfirmation(this.botToken, this.db, chatId, parsedItem, `${item.note} ${item.amount}`, messageId);
      }
      return;
    }

    const parsedResult = await AIService.parseTransactionText(this.env, effectiveText, chatId, this.db);
    if (parsedResult.type === 'set_balance') {
      const responseText = await TelegramCommandHandler.handleSetBalance(this.db, `${parsedResult.account} ${parsedResult.amount}`);
      await TelegramApiClient.sendMessage(this.botToken, chatId, responseText, { parse_mode: 'Markdown' });
      MemoryService.recordTurn(chatId, 'assistant', responseText);
      return;
    }
    const budgetWarning = await BudgetAlertService.checkSingleTransactionPacing(this.db, parsedResult.category, parsedResult.amount);
    if (budgetWarning) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, budgetWarning, { parse_mode: 'Markdown' });
    }

    await TxPresenter.presentTransactionConfirmation(this.botToken, this.db, chatId, parsedResult, parsedResult.note || effectiveText, messageId);
  }

  private async handleGroupSplitText(chatId: number, text: string): Promise<void> {
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

    await TelegramApiClient.sendMessage(this.botToken, chatId, splitText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `✅ Confirm & Save Group Split`, callback_data: `split_confirm:${splitResult.totalAmount}:${encodeURIComponent(splitResult.title)}` }],
          [{ text: `❌ Cancel`, callback_data: `tx_cancel:0` }]
        ]
      }
    });
  }

  private async handleDocument(chatId: number, text: string): Promise<void> {
    await TelegramApiClient.sendMessage(this.botToken, chatId, `📄 Processing PDF bank statement with Workers AI...`);
    const statementItems = await PDFStatementParser.parseStatementText(this.env, text || 'Meezan Bank Monthly Statement PDF', 'Meezan Bank');

    let summaryMsg = `📑 **Bank Statement Extracted (${statementItems.length} items):**\n──────────────────────\n`;
    for (const item of statementItems.slice(0, 5)) {
      summaryMsg += `• **${item.description}**: ${item.amount.toLocaleString()} PKR (${item.type.toUpperCase()})\n`;
    }
    summaryMsg += `\n*Tap below to confirm batch import into database:*`;

    await TelegramApiClient.sendMessage(this.botToken, chatId, summaryMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `✅ Import All ${statementItems.length} Items`, callback_data: `batch_import_confirm` }],
          [{ text: `❌ Cancel`, callback_data: `tx_cancel:0` }]
        ]
      }
    });
  }

  private async handleEditedMessage(msg: any): Promise<void> {
    const chatId = msg.chat?.id;
    const chatType = msg.chat?.type;
    const text: string = msg.text || msg.caption || '';
    if (!chatId || !text) return;

    if (chatType === 'group' || chatType === 'supergroup') {
      const groupHandler = new TelegramGroupBotHandler(this.env);
      await groupHandler.handleGroupWebhook(new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_message: msg })
      }));
      return;
    }

    const sender = msg.from;
    const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(' ') || sender?.username || 'User';
    const editDate = new Date(msg.edit_date ? msg.edit_date * 1000 : Date.now()).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

    const alertMsg = `⚠️ **Audit Notice: Message Edited**\n──────────────────────\n👤 **Sender:** ${senderName}\n🕒 **Time:** ${editDate}\n📝 **New Content:** "${text}"\n\n🛡️ *Security Trail Logged. Note: Editing past Telegram messages does NOT modify already confirmed database records. Use /undo to revert transactions if needed.*`;

    await TelegramApiClient.sendMessage(this.botToken, chatId, alertMsg, { parse_mode: 'Markdown' });
  }
}
