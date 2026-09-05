import { Env } from '../db/types';
import { GroupMongoDBClient } from '../db/mongodb';
import { AIService } from '../services/ai';
import { PDFStatementParser } from '../services/pdfParser';
import { GroupExpenseService, GroupExpense, GroupExpenseParticipant, isBotHandle, generateBillCode } from '../services/groupExpense';
import { AuditService } from '../services/audit';
import { TemporalResolver } from '../services/temporalResolver';
import { TelegramApiClient } from './client/telegramApi';
import { GroupPresenter } from './group/groupPresenter';
import { GroupCommands } from './group/groupCommands';
import { GroupCallbacks } from './group/groupCallbacks';
import { GroupAuditHandler } from './group/groupAuditHandler';
import { WhitelistCommands } from './commands/whitelistCommands';

const inMemoryGroupExpenses: Record<string, GroupExpense[]> = {};

export class TelegramGroupBotHandler {
  private env: Env;
  private db: GroupMongoDBClient;
  private botToken: string;

  constructor(env: Env) {
    this.env = env;
    this.db = new GroupMongoDBClient(env);
    this.botToken = env.TELEGRAM_GROUP_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '';
  }

  async handleGroupWebhook(request: Request): Promise<Response> {
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (this.env.TELEGRAM_SECRET_TOKEN && secretHeader !== this.env.TELEGRAM_SECRET_TOKEN) {
      return new Response('Unauthorized Group Webhook Request', { status: 401 });
    }

    try {
      const update: any = await request.json();

      if (update.message) {
        await this.handleGroupMessage(update.message);
      } else if (update.callback_query) {
        await this.handleGroupCallbackQuery(update.callback_query);
      } else if (update.edited_message) {
        await GroupAuditHandler.handleEditedGroupMessage(this.botToken, this.db, update.edited_message);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      console.error('[Group Webhook Error]:', err.message || err);
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
    }
  }

  public async getGroupExpenses(chatId: number | string): Promise<GroupExpense[]> {
    const key = String(chatId);
    if (!inMemoryGroupExpenses[key]) {
      const persisted = await this.db.getGroupExpensesByGroupId(key);
      inMemoryGroupExpenses[key] = persisted || [];
    }
    return inMemoryGroupExpenses[key];
  }

  public async addGroupExpense(chatId: number | string, exp: GroupExpense): Promise<void> {
    const key = String(chatId);
    if (!inMemoryGroupExpenses[key]) inMemoryGroupExpenses[key] = [];

    exp.evidenceHash = await TemporalResolver.generateEvidenceSignature({
      amount: exp.totalAmount,
      timestamp: exp.timestamp,
      note: exp.note,
      paidBy: exp.paidBy
    });

    inMemoryGroupExpenses[key].push(exp);
    await this.db.createGroupExpense(exp);
  }

  public async handleGroupCallbackQuery(cb: any): Promise<void> {
    await GroupCallbacks.handleGroupCallbackQuery(
      this.botToken,
      this.db,
      cid => this.getGroupExpenses(cid),
      (cid, text, expId) => this.sendReminder(cid, text, expId),
      cid => this.handleUndo(cid),
      cb
    );
  }

  public async handleGroupMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const text: string = msg.text || msg.caption || '';
    const sender = msg.from;
    const senderName = sender?.first_name ? `${sender.first_name}${sender.last_name ? ' ' + sender.last_name : ''}` : (sender?.username ? `@${sender.username}` : 'Member');

    // 1. Group Slash Commands
    if (text.startsWith('/')) {
      await this.dispatchSlashCommand(chatId, text, senderName, sender, msg);
      return;
    }

    // 2. Voice Note / Audio
    if (msg.voice || msg.audio) {
      await this.handleGroupVoice(chatId, msg, senderName, sender);
      return;
    }

    // 3. Photos / Receipts
    if (msg.photo && msg.photo.length > 0) {
      await this.handleGroupPhoto(chatId, msg, text, senderName, sender);
      return;
    }

    // 4. Documents / Statements
    if (msg.document) {
      await this.handleGroupDocument(chatId, msg, senderName, sender);
      return;
    }

    // 5. Plain Text Lunch Expense or Mention
    if (text.trim().length > 0) {
      const expenses = await this.getGroupExpenses(chatId);
      const isBotMentioned = text.includes('@') || /lunch|bill|split|paid|kharcha|hisaab/i.test(text);

      // Check for human-in-the-loop temporal bill settlement query
      const relativeDate = TemporalResolver.resolveDate(text);
      if (relativeDate && relativeDate.isPast && /clear|paid|bill|hisab|settle/i.test(text)) {
        const handled = await GroupPresenter.handleTemporalBillSettlementPrompt(
          this.botToken,
          chatId,
          expenses,
          relativeDate,
          senderName,
          sender
        );
        if (handled) return;
      }

      if (isBotMentioned) {
        await this.processGroupBillText(chatId, text, senderName, sender);
      }
    }
  }

  private async dispatchSlashCommand(chatId: number, text: string, senderName: string, sender: any, msg?: any): Promise<void> {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase().split('@')[0];
    const args = parts.slice(1).join(' ');
    const expenses = await this.getGroupExpenses(chatId);

    switch (command) {
      case '/whitelist':
      case '/allow':
      case '/auth':
        await WhitelistCommands.handleGroupWhitelist(this.botToken, this.env, this.db, chatId, msg, args, sender);
        break;
      case '/groupledger':
      case '/ledger':
      case '/groupbalance':
        await GroupPresenter.presentGroupBalanceMatrix(this.botToken, chatId, expenses);
        break;
      case '/summary':
      case '/groupsummary':
        await GroupCommands.handleGroupSummary(this.botToken, chatId, expenses);
        break;
      case '/member':
      case '/memberbalance':
      case '/user':
        await GroupPresenter.handleMemberBalanceQuery(this.botToken, chatId, expenses, args || senderName);
        break;
      case '/accounts':
        await GroupCommands.handleGroupAccounts(this.botToken, chatId);
        break;
      case '/setbalance':
        await GroupCommands.handleGroupSetBalance(this.botToken, chatId, args);
        break;
      case '/transfer':
        await GroupCommands.handleGroupTransfer(this.botToken, chatId, args, senderName);
        break;
      case '/setlimit':
        await GroupCommands.handleGroupSetLimit(this.botToken, chatId, args);
        break;
      case '/paylink':
        await GroupCommands.handleGroupPaylink(this.botToken, chatId, args, senderName);
        break;
      case '/goals':
        await GroupCommands.handleGroupGoals(this.botToken, chatId);
        break;
      case '/groupsettle':
      case '/settle':
        await GroupCommands.handleGroupSettle(this.botToken, chatId, args, expenses);
        break;
      case '/undo':
        await GroupCommands.handleGroupUndo(this.botToken, chatId, this.db, expenses);
        break;
      case '/advisor':
      case '/groupadvisor':
        await GroupCommands.handleGroupAdvisor(this.botToken, this.env, chatId, expenses);
        break;
      case '/groupremind':
      case '/remind':
        await GroupCommands.sendGroupReminder(this.botToken, chatId, expenses, args);
        break;
      case '/report':
      case '/groupreport':
        await GroupCommands.handleGroupReport(this.botToken, chatId, expenses);
        break;
      case '/persons':
      case '/members':
        await GroupCommands.handleGroupPersons(this.botToken, chatId, expenses);
        break;
      case '/groupquery':
      case '/query':
        await GroupCommands.handleGroupQuery(this.botToken, this.env, chatId, args, expenses);
        break;
      case '/audit':
      case '/auditlog':
      case '/logs':
      case '/evidence':
        await GroupCommands.handleGroupAuditLog(this.botToken, this.db, chatId);
        break;
      case '/pending':
      case '/bills':
      case '/openbills':
        await GroupCommands.handlePendingGroupBills(this.botToken, chatId, expenses);
        break;
      case '/markpaid':
      case '/paid':
        await this.handleMarkPaidByCode(chatId, args, senderName, sender);
        break;
      default:
        await TelegramApiClient.sendMessage(this.botToken, chatId, `Type \`/groupledger\`, \`/summary\`, or \`/bills\` to view group finances.`);
    }
  }

  private async processGroupBillText(chatId: number, text: string, senderName: string, sender: any): Promise<void> {
    await TelegramApiClient.sendMessage(this.botToken, chatId, `🧠 Workers AI analyzing group lunch bill...`);
    const parsed = await GroupExpenseService.parseGroupExpenseMessage(this.env, text, senderName);

    const rawParticipants = Array.from(new Set([...parsed.participantNames, senderName]));
    const uniqueParticipants = rawParticipants.filter(name => !isBotHandle(name));
    const perPersonShare = Math.round(parsed.totalAmount / (uniqueParticipants.length || 1));

    const participants: GroupExpenseParticipant[] = uniqueParticipants.map(name => ({
      name,
      username: name.startsWith('@') ? name.replace('@', '') : undefined,
      shareAmount: perPersonShare,
      status: (name.toLowerCase() === parsed.paidByName.toLowerCase() || name.toLowerCase() === `@${sender?.username?.toLowerCase()}`) ? 'paid' : 'unpaid'
    }));

    const expId = `gexp_${Date.now()}`;
    const billCode = generateBillCode();
    const groupExp: GroupExpense = {
      _id: expId,
      billCode,
      groupId: chatId,
      groupTitle: 'Office Group',
      totalAmount: parsed.totalAmount,
      paidBy: { userId: sender?.id, username: sender?.username, name: parsed.paidByName },
      note: parsed.note,
      participants,
      timestamp: new Date().toISOString()
    };

    await this.addGroupExpense(chatId, groupExp);

    const auditRecord = await AuditService.createAuditRecord({
      groupId: chatId,
      action: 'BILL_LOGGED',
      actor: { userId: sender?.id, username: sender?.username, name: senderName },
      expenseId: expId,
      details: {
        totalAmount: parsed.totalAmount,
        note: parsed.note,
        paidBy: parsed.paidByName,
        participants: uniqueParticipants
      },
      rawTelegramText: text
    });
    await this.db.createGroupAuditLog(auditRecord);

    await GroupPresenter.presentGroupExpenseCard(this.botToken, chatId, groupExp);
  }

  private async handleMarkPaidByCode(chatId: number, codeOrId: string, senderName: string, senderUser: any): Promise<boolean> {
    if (!codeOrId || codeOrId.trim().length === 0) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `⚠️ **Usage:** \`/markpaid <BillCode>\` (e.g. \`/markpaid B-7489\`)`);
      return false;
    }

    const cleanCode = codeOrId.trim().toUpperCase().replace('#', '').replace('BILL-', 'B-');
    const expenses = await this.getGroupExpenses(chatId);
    const exp = expenses.find(e => 
      (e.billCode && e.billCode.toUpperCase() === cleanCode) || 
      (e._id && e._id.toUpperCase() === cleanCode)
    );

    if (!exp) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `❌ **Bill Not Found:** Could not find open bill card matching \`#${cleanCode}\`. Type \`/bills\` to view open bill IDs.`);
      return false;
    }

    let markedAny = false;
    for (const p of exp.participants) {
      if (p.username === senderUser?.username || p.name.toLowerCase() === senderName.toLowerCase()) {
        p.status = 'paid';
        p.paidTimestamp = new Date().toISOString();
        markedAny = true;
      }
    }

    if (!markedAny && exp.participants.length > 0) {
      const unpaid = exp.participants.find(p => p.status === 'unpaid');
      if (unpaid) {
        unpaid.status = 'paid';
        unpaid.paidTimestamp = new Date().toISOString();
        markedAny = true;
      }
    }

    await this.db.updateGroupExpense(exp._id!, { participants: exp.participants });

    const auditRecord = await AuditService.createAuditRecord({
      groupId: chatId,
      action: 'MARKED_PAID',
      actor: { userId: senderUser?.id, username: senderUser?.username, name: senderName },
      expenseId: exp._id,
      details: { note: exp.note, totalAmount: exp.totalAmount }
    });
    await this.db.createGroupAuditLog(auditRecord);

    await TelegramApiClient.sendMessage(this.botToken, chatId, `✅ **Payment Marked for #${exp.billCode || exp._id}!**`);
    await GroupPresenter.presentGroupExpenseCard(this.botToken, chatId, exp);
    return true;
  }

  private async sendReminder(chatId: number, text?: string, expId?: string): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    await GroupCommands.sendGroupReminder(this.botToken, chatId, expenses, text, expId);
  }

  private async handleUndo(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    await GroupCommands.handleGroupUndo(this.botToken, chatId, this.db, expenses);
  }

  private async handleGroupVoice(chatId: number, msg: any, senderName: string, sender: any): Promise<void> {
    const voiceObj = msg.voice || msg.audio;
    await TelegramApiClient.sendMessage(this.botToken, chatId, `🎙️ Transcribing voice note with Cloudflare Workers AI Whisper...`);
    const audioBuffer = await TelegramApiClient.downloadFile(this.botToken, voiceObj.file_id);
    if (!audioBuffer) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `❌ Failed to download voice message.`);
      return;
    }
    const transcribed = await AIService.transcribeAudio(this.env, audioBuffer);
    await this.processGroupBillText(chatId, transcribed, senderName, sender);
  }

  private async handleGroupPhoto(chatId: number, msg: any, text: string, senderName: string, sender: any): Promise<void> {
    const photo = msg.photo[msg.photo.length - 1];
    await TelegramApiClient.sendMessage(this.botToken, chatId, `📸 Scanning lunch receipt via Cloudflare Workers AI Vision...`);
    const imageBuffer = await TelegramApiClient.downloadFile(this.botToken, photo.file_id);
    if (!imageBuffer) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `❌ Failed to download photo.`);
      return;
    }
    const parsedReceipt = await AIService.parseReceiptImage(this.env, imageBuffer);
    if (!parsedReceipt) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `📸 **Receipt Details Unclear:** Please type the bill amount and who shared it.`);
      return;
    }
    await this.processGroupBillText(chatId, `${parsedReceipt.note || 'Lunch'} ${parsedReceipt.amount} ${text}`, senderName, sender);
  }

  private async handleGroupDocument(chatId: number, msg: any, senderName: string, sender: any): Promise<void> {
    const doc = msg.document;
    if (doc.mime_type === 'application/pdf' || doc.file_name?.endsWith('.pdf')) {
      await TelegramApiClient.sendMessage(this.botToken, chatId, `📄 Parsing statement PDF...`);
      const buffer = await TelegramApiClient.downloadFile(this.botToken, doc.file_id);
      if (buffer) {
        const text = new TextDecoder().decode(buffer);
        const parsedTxs = await PDFStatementParser.parseStatementText(this.env, text);
        await TelegramApiClient.sendMessage(this.botToken, chatId, `✅ Found ${parsedTxs.length} items in statement.`);
      }
    }
  }
}
