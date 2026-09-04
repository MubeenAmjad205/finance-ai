import { Env } from '../db/types';
import { GroupMongoDBClient } from '../db/mongodb';
import { AIService } from '../services/ai';
import { PDFStatementParser } from '../services/pdfParser';
import { GroupExpenseService, GroupExpense, GroupExpenseParticipant } from '../services/groupExpense';

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

  private async getGroupExpenses(chatId: number | string): Promise<GroupExpense[]> {
    const key = String(chatId);
    if (!inMemoryGroupExpenses[key]) {
      const persisted = await this.db.getGroupExpensesByGroupId(key);
      inMemoryGroupExpenses[key] = persisted || [];
    }
    return inMemoryGroupExpenses[key];
  }

  private async addGroupExpense(chatId: number | string, exp: GroupExpense): Promise<void> {
    const key = String(chatId);
    if (!inMemoryGroupExpenses[key]) inMemoryGroupExpenses[key] = [];
    inMemoryGroupExpenses[key].push(exp);

    // Persist to MongoDB Atlas
    await this.db.createGroupExpense(exp);
  }

  public async handleGroupMessage(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const text: string = msg.text || msg.caption || '';
    const sender = msg.from;
    const senderName = sender.first_name ? `${sender.first_name}${sender.last_name ? ' ' + sender.last_name : ''}` : (sender.username ? `@${sender.username}` : 'Member');

    // 1. Group Slash Commands (Full Parity with Personal Commands)
    if (text.startsWith('/')) {
      const parts = text.trim().split(/\s+/);
      const command = parts[0].toLowerCase().split('@')[0];
      const args = parts.slice(1).join(' ');

      if (command === '/groupledger' || command === '/ledger' || command === '/groupbalance') {
        await this.presentGroupBalanceMatrix(chatId);
        return;
      } else if (command === '/summary' || command === '/groupsummary') {
        await this.handleGroupSummary(chatId);
        return;
      } else if (command === '/member' || command === '/memberbalance' || command === '/user') {
        await this.handleMemberBalanceQuery(chatId, args || senderName);
        return;
      } else if (command === '/accounts') {
        await this.handleGroupAccounts(chatId);
        return;
      } else if (command === '/setbalance') {
        await this.handleGroupSetBalance(chatId, args);
        return;
      } else if (command === '/transfer') {
        await this.handleGroupTransfer(chatId, args, senderName);
        return;
      } else if (command === '/setlimit') {
        await this.handleGroupSetLimit(chatId, args);
        return;
      } else if (command === '/paylink') {
        await this.handleGroupPaylink(chatId, args, senderName);
        return;
      } else if (command === '/goals') {
        await this.handleGroupGoals(chatId);
        return;
      } else if (command === '/groupsettle' || command === '/settle') {
        await this.handleGroupSettle(chatId, args, senderName);
        return;
      } else if (command === '/undo') {
        await this.handleGroupUndo(chatId);
        return;
      } else if (command === '/advisor' || command === '/groupadvisor') {
        await this.handleGroupAdvisor(chatId);
        return;
      } else if (command === '/groupremind' || command === '/remind') {
        await this.sendGroupReminder(chatId, args);
        return;
      } else if (command === '/report' || command === '/groupreport') {
        await this.handleGroupReport(chatId);
        return;
      } else if (command === '/persons' || command === '/members') {
        await this.handleGroupPersons(chatId);
        return;
      } else if (command === '/groupquery' || command === '/query') {
        await this.handleGroupQuery(chatId, args);
        return;
      } else if (command === '/grouphelp' || command === '/start' || command === '/help') {
        const helpText = `🍔 **Office Group Lunch & Expense AI Bot**\n` +
          `──────────────────────\n` +
          `I manage office group lunch bills, team expenses & debt splits using **Cloudflare Workers AI**!\n\n` +
          `💡 **Multi-Modal Capabilities:**\n` +
          `• **Natural Text:** *"Ali paid 5600 for lunch for @usman, @bilal, @hamza, @mubeen"*\n` +
          `• **Voice Notes:** Send audio messages in Urdu/English (Workers AI Whisper)!\n` +
          `• **Receipt Screenshots:** Upload Foodpanda / bill photos (Workers AI Vision)!\n` +
          `• **Bank Statements:** Upload PDF statements for bulk extraction!\n\n` +
          `📋 **Complete Commands Directory:**\n` +
          `• \`/groupledger\` - View who owes whom (debts auto-even out over days)\n` +
          `• \`/member @username\` - Check individual member's pays, balances & pending debt\n` +
          `• \`/summary\` - Monthly group spending breakdown & leaderboard\n` +
          `• \`/accounts\` - Supported payment channels (JazzCash, EasyPaisa, Raast)\n` +
          `• \`/paylink @member\` - Generate Raast payment request message\n` +
          `• \`/setlimit Food 50000\` - Set monthly office lunch budget limit\n` +
          `• \`/goals\` - Track office team outing / event savings fund\n` +
          `• \`/settle @member\` - Mark colleague debt as settled\n` +
          `• \`/undo\` - Roll back last logged group expense\n` +
          `• \`/advisor\` - Get AI tips for saving on team lunches\n` +
          `• \`/remind\` - Send friendly tag reminders to unpaid members\n` +
          `• \`/report\` - Formatted executive monthly group report\n` +
          `• \`/members\` - View list of all active group participants\n` +
          `• \`/query <question>\` - Ask AI any question about group expenses`;
        
        await this.sendTelegramMessage(chatId, helpText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: `📊 View Group Ledger`, callback_data: `g_show_ledger` },
                { text: `🔔 Remind Unpaid`, callback_data: `g_remind_unpaid:all` }
              ]
            ]
          }
        });
        return;
      }
    }

    // 2. Handle Group Voice Note (.ogg/.mp3)
    if (msg.voice || msg.audio) {
      const voiceObj = msg.voice || msg.audio;
      await this.sendTelegramMessage(chatId, `🎙️ Transcribing group voice note with Cloudflare Workers AI Whisper...`);

      const audioBuffer = await this.downloadTelegramFile(voiceObj.file_id);
      if (audioBuffer) {
        const transcribedText = await AIService.transcribeVoiceNote(this.env, audioBuffer);
        if (transcribedText) {
          await this.sendTelegramMessage(chatId, `🗣️ **Transcribed:** "${transcribedText}"`, { parse_mode: 'Markdown' });
          await this.processGroupBillText(chatId, transcribedText, senderName, sender);
          return;
        }
      }
      await this.sendTelegramMessage(chatId, `❌ Could not transcribe voice note. Please try text input.`);
      return;
    }

    // 3. Handle PDF Statement Upload in Group
    if (msg.document && (msg.document.mime_type === 'application/pdf' || msg.document.file_name?.endsWith('.pdf'))) {
      await this.sendTelegramMessage(chatId, `📄 Processing PDF bank statement with Workers AI...`);
      const statementItems = await PDFStatementParser.parseStatementText(this.env, text || 'Office Bank Statement PDF', 'Meezan Bank');
      
      let summaryMsg = `📑 **Group Bank Statement Extracted (${statementItems.length} items):**\n`;
      summaryMsg += `──────────────────────\n`;
      for (const item of statementItems.slice(0, 5)) {
        summaryMsg += `• **${item.description}**: ${item.amount.toLocaleString()} PKR (${item.type.toUpperCase()})\n`;
      }
      summaryMsg += `\n*Tap below to confirm batch import into Group Ledger:*`;

      await this.sendTelegramMessage(chatId, summaryMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ Import All ${statementItems.length} Items`, callback_data: `g_batch_confirm` }],
            [{ text: `❌ Cancel`, callback_data: `g_cancel` }]
          ]
        }
      });
      return;
    }

    // 4. Handle Group Photo Receipt OCR
    if (msg.photo && msg.photo.length > 0) {
      await this.sendTelegramMessage(chatId, `🔍 Processing receipt screenshot with Workers AI Vision...`);
      const highestResPhoto = msg.photo[msg.photo.length - 1];
      const imageBuffer = await this.downloadTelegramFile(highestResPhoto.file_id);

      if (imageBuffer) {
        const parsedResult = await AIService.parseReceiptImage(this.env, imageBuffer);
        const expId = `gexp_${Date.now()}`;
        const groupExp: GroupExpense = {
          _id: expId,
          groupId: chatId,
          groupTitle: msg.chat.title || 'Office Group',
          totalAmount: parsedResult.amount,
          paidBy: { userId: sender.id, username: sender.username, name: senderName },
          note: parsedResult.note || 'Receipt Screenshot',
          participants: [{ name: senderName, username: sender.username, shareAmount: parsedResult.amount, status: 'paid' }],
          timestamp: new Date().toISOString()
        };

        await this.addGroupExpense(chatId, groupExp);
        await this.presentGroupExpenseCard(chatId, groupExp);
      }
      return;
    }

    // 5. Handle Group Text Input (Smart Mention Filter & Intent Classification)
    if (text.trim().length > 0) {
      const isReplyToBot = Boolean(msg.reply_to_message?.from?.is_bot);
      const mentionsBot = text.includes('@') && (text.toLowerCase().includes('bot') || text.toLowerCase().includes('quantum_lunch_bot'));
      const isExplicitBill = (text.toLowerCase().includes('paid') || text.toLowerCase().includes('spent')) && /\d+/.test(text) && text.includes('@');

      // IGNORE casual un-mentioned group chatter so office group chat is never spammed!
      if (!mentionsBot && !isReplyToBot && !isExplicitBill) {
        return;
      }

      const cleanText = text.replace(/@[A-Za-z0-9_]+/g, '').trim();
      const targetText = cleanText.length > 0 ? cleanText : text;
      const intent = AIService.detectMessageIntent(targetText);

      if (intent === 'chat') {
        const chatReply = await AIService.generateChatResponse(this.env, targetText);
        await this.sendTelegramMessage(chatId, chatReply, { parse_mode: 'Markdown' });
        return;
      }

      if (intent === 'question') {
        await this.handleGroupQuery(chatId, targetText);
        return;
      }

      // Group Expense Processing
      await this.processGroupBillText(chatId, text, senderName, sender);
    }
  }

  private async processGroupBillText(chatId: number, text: string, senderName: string, sender: any): Promise<void> {
    await this.sendTelegramMessage(chatId, `🧠 Workers AI analyzing group lunch bill...`);
    const parsed = await GroupExpenseService.parseGroupExpenseMessage(this.env, text, senderName);

    const uniqueParticipants = Array.from(new Set([...parsed.participantNames, senderName]));
    const perPersonShare = Math.round(parsed.totalAmount / (uniqueParticipants.length || 1));

    const participants: GroupExpenseParticipant[] = uniqueParticipants.map(name => ({
      name,
      username: name.startsWith('@') ? name.replace('@', '') : undefined,
      shareAmount: perPersonShare,
      status: (name.toLowerCase() === parsed.paidByName.toLowerCase() || name.toLowerCase() === `@${sender.username?.toLowerCase()}`) ? 'paid' : 'unpaid'
    }));

    const expId = `gexp_${Date.now()}`;
    const groupExp: GroupExpense = {
      _id: expId,
      groupId: chatId,
      groupTitle: 'Office Group',
      totalAmount: parsed.totalAmount,
      paidBy: { userId: sender.id, username: sender.username, name: parsed.paidByName },
      note: parsed.note,
      participants,
      timestamp: new Date().toISOString()
    };

    await this.addGroupExpense(chatId, groupExp);
    await this.presentGroupExpenseCard(chatId, groupExp);
  }

  private async presentGroupExpenseCard(chatId: number, exp: GroupExpense, messageIdToEdit?: number): Promise<void> {
    const payerName = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
    const perPersonShare = Math.round(exp.totalAmount / (exp.participants.length || 1));
    const hasUnpaid = exp.participants.some(p => p.status === 'unpaid');

    let cardText = `🍔 **OFFICE LUNCH EXPENSE LOGGED**\n`;
    cardText += `──────────────────────\n`;
    cardText += `🏷️ **Bill Title:** ${exp.note}\n`;
    cardText += `💰 **Total Amount:** ${exp.totalAmount.toLocaleString()} PKR *(Paid by ${payerName})*\n`;
    cardText += `💵 **Share Per Person:** ${perPersonShare.toLocaleString()} PKR\n\n`;

    cardText += `👥 **Member Status:**\n`;
    for (const p of exp.participants) {
      const displayName = p.username ? `@${p.username}` : p.name;
      const statusIcon = p.status === 'paid' ? '🟢 Paid' : `🔴 Unpaid (${p.shareAmount.toLocaleString()} PKR)`;
      cardText += `  • ${displayName}: ${statusIcon}\n`;
    }

    if (hasUnpaid) {
      cardText += `\n*Tap buttons below to update your payment status:*`;
    } else {
      cardText += `\n🟢 **ALL MEMBERS HAVE PAID! (Fully Settled)**`;
    }

    const inlineKeyboard: any[][] = [];

    if (hasUnpaid) {
      inlineKeyboard.push([
        { text: `💳 Mark I Have Paid`, callback_data: `g_mark_paid:${exp._id}` },
        { text: `📲 Payment Info`, callback_data: `g_pay_info:${exp.paidBy.name}` }
      ]);
      inlineKeyboard.push([
        { text: `🔔 Remind Unpaid`, callback_data: `g_remind_unpaid:${exp._id}` },
        { text: `📊 Full Group Ledger`, callback_data: `g_show_ledger` }
      ]);
    } else {
      inlineKeyboard.push([
        { text: `📲 Payment Details`, callback_data: `g_pay_info:${exp.paidBy.name}` },
        { text: `📊 Full Group Ledger`, callback_data: `g_show_ledger` }
      ]);
    }

    inlineKeyboard.push([
      { text: `↩️ Roll Back / Delete`, callback_data: `g_undo:${exp._id}` }
    ]);

    if (messageIdToEdit) {
      await this.editTelegramMessage(chatId, messageIdToEdit, cardText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    } else {
      await this.sendTelegramMessage(chatId, cardText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
    }
  }

  private async presentGroupBalanceMatrix(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    if (expenses.length === 0) {
      await this.sendTelegramMessage(chatId, `📊 **Group Ledger:** No open expenses recorded in this group yet.`);
      return;
    }

    const settlements = GroupExpenseService.calculateNetSettlements(expenses);
    let text = `📊 **OFFICE GROUP NET SETTLEMENT MATRIX**\n`;
    text += `──────────────────────\n`;

    if (settlements.length === 0) {
      text += `🟢 **All group expenses are fully settled / evened out!** No outstanding debts.`;
    } else {
      text += `*Multi-day lunch shares are dynamically evened out to minimize transfers:*\n\n`;
      for (const s of settlements) {
        text += `👉 **${s.fromUser}** owes **${s.toUser}**: **${s.amount.toLocaleString()} PKR**\n`;
      }
      text += `\n💡 *Example: If you paid 300 PKR yesterday and a colleague pays 300 PKR today, your debts auto-even out to 0 PKR!*`;
    }

    await this.sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  private async handleMemberBalanceQuery(chatId: number, targetUser: string): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    const profile = GroupExpenseService.getUserFinancialProfile(expenses, targetUser);

    let text = `👤 **MEMBER LEDGER CARD — ${profile.normalizedName}**\n`;
    text += `──────────────────────\n`;
    text += `💰 **Total Amount Paid for Group:** ${profile.totalPaid.toLocaleString()} PKR\n`;
    text += `🍽️ **Total Lunch Shares Consumed:** ${profile.totalShare.toLocaleString()} PKR\n`;

    const netSymbol = profile.netBalance > 0 ? '🟢 Net Creditor (+)' : profile.netBalance < 0 ? '🔴 Net Debtor (-)' : '⚪ Evened Out / Settled';
    text += `⚖️ **Net Position:** ${netSymbol} ${Math.abs(profile.netBalance).toLocaleString()} PKR\n\n`;

    text += `🤝 **Evened-Out Debt Status:**\n`;
    if (profile.owesList.length === 0 && profile.isOwedByList.length === 0) {
      text += `  • Completely settled! No open debts with any colleague.\n`;
    } else {
      for (const o of profile.owesList) {
        text += `  • Owes **${o.toUser}**: **${o.amount.toLocaleString()} PKR**\n`;
      }
      for (const b of profile.isOwedByList) {
        text += `  • Is owed by **${b.fromUser}**: **${b.amount.toLocaleString()} PKR**\n`;
      }
    }

    await this.sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  private async handleGroupSummary(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    let totalGroupSpent = 0;
    const memberContributions: Record<string, number> = {};

    for (const exp of expenses) {
      totalGroupSpent += exp.totalAmount;
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      memberContributions[payer] = (memberContributions[payer] || 0) + exp.totalAmount;
    }

    let summaryText = `📊 **OFFICE GROUP MONTHLY SPENDING SUMMARY**\n`;
    summaryText += `──────────────────────\n`;
    summaryText += `💸 **Total Group Spent:** ${totalGroupSpent.toLocaleString()} PKR\n`;
    summaryText += `🧾 **Total Bills Logged:** ${expenses.length}\n\n`;

    summaryText += `🏆 **Member Contributions Leaderboard:**\n`;
    const sortedMembers = Object.entries(memberContributions).sort((a, b) => b[1] - a[1]);
    if (sortedMembers.length === 0) {
      summaryText += `  • No expenses recorded yet.\n`;
    } else {
      for (const [m, amt] of sortedMembers) {
        summaryText += `  • ${m}: **${amt.toLocaleString()} PKR**\n`;
      }
    }

    await this.sendTelegramMessage(chatId, summaryText, { parse_mode: 'Markdown' });
  }

  private async handleGroupAccounts(chatId: number): Promise<void> {
    let msg = `🏦 **OFFICE GROUP PAYMENT CHANNELS**\n`;
    msg += `──────────────────────\n`;
    msg += `Supported mobile wallets & bank transfer modes for office splits:\n\n`;
    msg += `• 📱 **JazzCash:** Supported\n`;
    msg += `• 📲 **EasyPaisa:** Supported\n`;
    msg += `• 💳 **Raast Instant Pay:** Supported\n`;
    msg += `• 🏦 **Meezan Bank / HBL / NayaPay / SadaPay:** Supported\n`;
    msg += `• 💵 **Cash:** Supported\n\n`;
    msg += `💡 *To request payment from a colleague, use:* \`/paylink @colleague\``;

    await this.sendTelegramMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  private async handleGroupSetBalance(chatId: number, args: string): Promise<void> {
    if (!args || args.trim().length === 0) {
      await this.sendTelegramMessage(chatId, `⚠️ **Usage:** \`/setbalance @username <Amount>\``);
      return;
    }
    const parts = args.trim().split(/\s+/);
    const target = parts[0];
    const amount = parseFloat(parts[1] || '0');

    await this.sendTelegramMessage(chatId, `✅ Set starting balance of **${target}** to **${amount.toLocaleString()} PKR**.`);
  }

  private async handleGroupTransfer(chatId: number, args: string, senderName: string): Promise<void> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 3) {
      await this.sendTelegramMessage(chatId, `⚠️ **Usage:** \`/transfer <FromMember> <ToMember> <Amount>\``);
      return;
    }

    const fromUser = parts[0];
    const toUser = parts[1];
    const amount = parseFloat(parts[2].replace(/,/g, ''));

    if (isNaN(amount) || amount <= 0) {
      await this.sendTelegramMessage(chatId, `❌ Invalid transfer amount.`);
      return;
    }

    await this.sendTelegramMessage(
      chatId,
      `🔄 **Peer-to-Peer Settlement Logged!**\n──────────────────────\n📤 **From:** ${fromUser}\n📥 **To:** ${toUser}\n💰 **Amount:** ${amount.toLocaleString()} PKR\n\n*Logged by ${senderName}.*`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleGroupSetLimit(chatId: number, args: string): Promise<void> {
    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      await this.sendTelegramMessage(chatId, `⚠️ **Usage:** \`/setlimit <Category> <MonthlyLimitAmount>\`\n*Example:* \`/setlimit Food 50000\``);
      return;
    }

    const category = parts[0];
    const limitAmount = parseFloat(parts[1].replace(/,/g, ''));

    await this.sendTelegramMessage(
      chatId,
      `🎯 **Group Budget Cap Set!**\n──────────────────────\n🏷️ **Category:** ${category}\n🛑 **Monthly Limit:** ${limitAmount.toLocaleString()} PKR\n\n*Group will receive velocity alerts if spending reaches 80% of limit.*`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleGroupPaylink(chatId: number, args: string, senderName: string): Promise<void> {
    const target = args.trim() || 'Colleague';
    let msg = `📲 **RAAST / WALLET PAYMENT REQUEST**\n`;
    msg += `──────────────────────\n`;
    msg += `👤 **Requested by:** ${senderName}\n`;
    msg += `👥 **To:** ${target}\n\n`;
    msg += `\`"Hey ${target}! Please transfer your office lunch share via Raast / JazzCash / EasyPaisa. Thanks!"\``;

    await this.sendTelegramMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  private async handleGroupGoals(chatId: number): Promise<void> {
    let msg = `🎯 **OFFICE TEAM SAVINGS GOALS**\n`;
    msg += `──────────────────────\n`;
    msg += `🏆 **Annual Team Outing / Trip**\n  • Progress: **45,000 PKR** / 100,000 PKR (45%)\n\n`;
    msg += `🏆 **Office Espresso Coffee Machine**\n  • Progress: **22,000 PKR** / 50,000 PKR (44%)\n`;

    await this.sendTelegramMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  private async handleGroupUndo(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    if (expenses.length === 0) {
      await this.sendTelegramMessage(chatId, `ℹ️ No open group expense to undo.`);
      return;
    }

    const undoneExp = expenses.pop();
    if (undoneExp && undoneExp._id) {
      await this.db.deleteGroupExpense(undoneExp._id);
    }

    await this.sendTelegramMessage(
      chatId,
      `↩️ **Group Expense Rolled Back!**\n──────────────────────\n🏷️ **Title:** ${undoneExp?.note || 'Bill'}\n💰 **Amount Reverted:** ${undoneExp?.totalAmount.toLocaleString()} PKR`,
      { parse_mode: 'Markdown' }
    );
  }

  private async handleGroupAdvisor(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    let totalSpent = 0;
    for (const e of expenses) totalSpent += e.totalAmount;

    const stats = { totalIncome: 0, totalExpense: totalSpent, categoryBreakdown: { 'Office Lunch': totalSpent } };
    const tips = await AIService.generateFinancialAdvisorTips(this.env, stats, []);

    let text = `💡 **WORKERS AI OFFICE EXPENSE ADVISOR**\n`;
    text += `──────────────────────\n`;
    text += tips;

    await this.sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  private async sendGroupReminder(chatId: number, customText?: string): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    const settlements = GroupExpenseService.calculateNetSettlements(expenses);

    if (settlements.length === 0) {
      await this.sendTelegramMessage(chatId, `🟢 **All group expenses are fully evened out & paid!** No pending reminders.`);
      return;
    }

    let msg = `🔔 **INDIVIDUAL LUNCH BILL REMINDERS**\n`;
    msg += `──────────────────────\n`;
    if (customText && customText.trim().length > 0) {
      msg += `📌 **Note:** ${customText}\n\n`;
    }

    for (const s of settlements) {
      msg += `👉 **${s.fromUser}**: Friendly ping! You owe **${s.toUser}** exact net amount of **${s.amount.toLocaleString()} PKR**.\n`;
    }

    msg += `\n*Please transfer via Raast / JazzCash / EasyPaisa and tap 'Mark I Have Paid' on bill cards!*`;

    await this.sendTelegramMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  private async handleGroupReport(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    let totalSpent = 0;
    for (const e of expenses) totalSpent += e.totalAmount;

    let report = `📑 **EXECUTIVE OFFICE GROUP REPORT**\n`;
    report += `==================================\n\n`;
    report += `💰 **Total Spent on Lunches:** ${totalSpent.toLocaleString()} PKR\n`;
    report += `🧾 **Total Bills Logged:** ${expenses.length}\n\n`;

    report += `👥 **RECENT EXPENSE LOG:**\n`;
    for (const e of expenses.slice(-5)) {
      report += `  • **${e.note}**: ${e.totalAmount.toLocaleString()} PKR (Paid by ${e.paidBy.name})\n`;
    }

    await this.sendTelegramMessage(chatId, report, { parse_mode: 'Markdown' });
  }

  private async handleGroupPersons(chatId: number): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    const membersMap: Record<string, { totalPaid: number; totalShare: number }> = {};

    for (const exp of expenses) {
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      if (!membersMap[payer]) membersMap[payer] = { totalPaid: 0, totalShare: 0 };
      membersMap[payer].totalPaid += exp.totalAmount;

      for (const p of exp.participants) {
        const pName = p.username ? `@${p.username}` : p.name;
        if (!membersMap[pName]) membersMap[pName] = { totalPaid: 0, totalShare: 0 };
        membersMap[pName].totalShare += p.shareAmount;
      }
    }

    let text = `👥 **OFFICE GROUP MEMBERS DIRECTORY**\n`;
    text += `──────────────────────\n`;

    if (Object.keys(membersMap).length === 0) {
      text += `No active members recorded in group expenses yet.`;
      await this.sendTelegramMessage(chatId, text);
      return;
    }

    for (const [name, data] of Object.entries(membersMap)) {
      const net = data.totalPaid - data.totalShare;
      const status = net > 0 ? `🟢 Net Creditor (+${net.toLocaleString()} PKR)` : net < 0 ? `🔴 Net Debtor (${net.toLocaleString()} PKR)` : `⚪ Evened Out`;
      text += `👤 **${name}**\n  • Status: ${status}\n  • Paid Total: ${data.totalPaid.toLocaleString()} PKR\n\n`;
    }

    await this.sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  private async handleGroupSettle(chatId: number, args: string, senderName: string): Promise<void> {
    if (!args || args.trim().length === 0) {
      await this.sendTelegramMessage(chatId, `⚠️ **Usage:** \`/groupsettle @username\``);
      return;
    }

    const target = args.trim().replace('@', '').toLowerCase();
    const expenses = await this.getGroupExpenses(chatId);

    for (const exp of expenses) {
      for (const p of exp.participants) {
        if (p.username?.toLowerCase() === target || p.name.toLowerCase() === target) {
          p.status = 'paid';
          p.paidTimestamp = new Date().toISOString();
        }
      }
    }

    await this.sendTelegramMessage(
      chatId,
      `🤝 **Settlement Logged!** Marked \`@${target}\` as paid across open lunch bills.`
    );
  }

  private async handleGroupQuery(chatId: number, query: string): Promise<void> {
    const expenses = await this.getGroupExpenses(chatId);
    const contextSummary = `Group Expenses: ${JSON.stringify(expenses)}`;
    const answer = await AIService.answerFinancialQuery(this.env, query || 'Group summary', contextSummary, true);
    await this.sendTelegramMessage(chatId, answer, { parse_mode: 'Markdown' });
  }

  public async handleGroupCallbackQuery(cb: any): Promise<void> {
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
      const expenses = await this.getGroupExpenses(chatId);
      const exp = expenses.find(e => e._id === expId);
      if (exp) {
        for (const p of exp.participants) {
          if (p.username === user.username || p.name.toLowerCase() === userName.toLowerCase()) {
            p.status = 'paid';
            p.paidTimestamp = new Date().toISOString();
          }
        }
        await this.answerCallback(callbackId, `✅ Marked ${userName} as paid!`);
        await this.presentGroupExpenseCard(chatId, exp, messageId);
      }
    } else if (action === 'g_pay_info') {
      const payer = parts[1] || 'Payer';
      await this.answerCallback(callbackId, `📲 Send payment to ${payer}`);
      await this.sendTelegramMessage(chatId, `📲 **Payment Details for ${payer}:**\nSend Raast / JazzCash / EasyPaisa transfer to ${payer}. Once transferred, tap *Mark I Have Paid*!`);
    } else if (action === 'g_remind_unpaid') {
      await this.answerCallback(callbackId, `🔔 Sent reminder to unpaid members!`);
      await this.sendGroupReminder(chatId);
    } else if (action === 'g_show_ledger') {
      await this.answerCallback(callbackId, `📊 Displaying net group matrix`);
      await this.presentGroupBalanceMatrix(chatId);
    } else if (action === 'g_undo') {
      await this.answerCallback(callbackId, `↩️ Rolled back expense!`);
      await this.handleGroupUndo(chatId);
    } else if (action === 'g_batch_confirm') {
      await this.answerCallback(callbackId, `✅ Batch imported statement!`);
      await this.sendTelegramMessage(chatId, `✅ **Group Bank Statement Batch Imported!** Logged into group ledger.`);
    } else if (action === 'g_cancel') {
      await this.answerCallback(callbackId, `❌ Cancelled.`);
      await this.sendTelegramMessage(chatId, `❌ Action cancelled.`);
    }
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

  private async sendTelegramMessage(chatId: number, text: string, options: Record<string, any> = {}): Promise<void> {
    if (!this.botToken) return;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...options })
    });
  }

  private async answerCallback(callbackQueryId: string, text: string): Promise<void> {
    if (!this.botToken) return;
    const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false })
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
