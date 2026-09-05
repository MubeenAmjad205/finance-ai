import { GroupMongoDBClient } from '../../db/mongodb';
import { TemporalResolver } from '../../services/temporalResolver';
import { TelegramApiClient } from '../client/telegramApi';

export class GroupAuditHandler {
  static async handleEditedGroupMessage(
    botToken: string,
    db: GroupMongoDBClient,
    msg: any
  ): Promise<void> {
    const chatId = msg.chat?.id;
    if (!chatId) return;

    const sender = msg.from;
    const senderName = sender?.first_name || 'Member';
    const text = msg.text || msg.caption || '';
    const editDate = msg.edit_date ? new Date(msg.edit_date * 1000).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }) : 'Just now';

    // 1. Generate cryptographic evidence signature
    const evidenceHash = await TemporalResolver.generateEvidenceSignature({
      amount: 0,
      timestamp: new Date().toISOString(),
      note: `Edited message ID ${msg.message_id}`,
      paidBy: sender
    });

    // 2. Persist immutable audit log to MongoDB
    await db.createGroupAuditLog({
      groupId: chatId,
      groupTitle: msg.chat?.title || 'Office Group',
      timestamp: new Date().toISOString(),
      action: 'MESSAGE_EDITED',
      actor: {
        userId: sender?.id,
        username: sender?.username,
        name: senderName
      },
      details: {
        note: text,
        previousState: 'Edited in Telegram',
        newState: text
      },
      rawTelegramText: text,
      telegramMessageId: msg.message_id,
      evidenceHash,
      createdAt: new Date().toISOString()
    });

    // 3. Alert group chat
    const alertMsg = `⚠️ **Audit Alert: Message Edited**\n──────────────────────\n👤 **Colleague:** ${senderName}${sender?.username ? ` (@${sender.username})` : ''}\n🕒 **Time:** ${editDate}\n📝 **New Content:** "${text}"\n\n🛡️ *Audit Trail Saved. Note: Editing Telegram messages does NOT modify already confirmed database records. Use /undo to revert transactions.*`;

    await TelegramApiClient.sendMessage(botToken, chatId, alertMsg, { parse_mode: 'Markdown' });
  }
}
