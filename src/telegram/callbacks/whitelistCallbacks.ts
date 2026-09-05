import { Env } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';
import { TelegramApiClient } from '../client/telegramApi';

export class WhitelistCallbacks {
  static async handleAuthRequest(
    botToken: string,
    env: Env,
    callbackQueryId: string,
    chatId: number,
    messageId: number,
    data: string,
    from: any
  ): Promise<void> {
    const userId = data.replace('auth_req:', '');
    const userName = from.first_name || from.username || `User ${userId}`;
    const usernameTag = from.username ? `@${from.username}` : 'No username';

    await TelegramApiClient.answerCallback(botToken, callbackQueryId, 'Request sent to bot owner!');

    // Update user's message
    await TelegramApiClient.editMessage(
      botToken,
      chatId,
      messageId,
      `⏳ *Access Request Submitted*\n\nYour request has been forwarded to the bot administrator.\nYou will be notified here as soon as access is granted.`,
      { parse_mode: 'Markdown' }
    );

    // Identify owner/admin chat ID to notify
    const adminChatId = env.TELEGRAM_CHAT_ID || env.TELEGRAM_ALLOWED_USER_IDS?.split(',')[0]?.trim();
    if (!adminChatId) return;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve Access', callback_data: `auth_appr:${userId}:${encodeURIComponent(userName)}` },
          { text: '❌ Deny', callback_data: `auth_deny:${userId}` }
        ]
      ]
    };

    await TelegramApiClient.sendMessage(
      botToken,
      adminChatId,
      `🔔 *New Whitelist Access Request*\n\n` +
      `👤 **User:** ${userName} (${usernameTag})\n` +
      `🆔 **User ID:** \`${userId}\`\n\n` +
      `Grant this user access to use your personal finance AI bot?`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  }

  static async handleAuthApprove(
    botToken: string,
    env: Env,
    db: MongoDBClient,
    callbackQueryId: string,
    chatId: number,
    messageId: number,
    data: string,
    from: any
  ): Promise<void> {
    const parts = data.replace('auth_appr:', '').split(':');
    const targetUserId = parts[0];
    const targetName = parts[1] ? decodeURIComponent(parts[1]) : `User ${targetUserId}`;

    await db.whitelist.add({
      userId: targetUserId,
      firstName: targetName,
      addedBy: String(from.id),
      chatType: 'personal'
    });

    await TelegramApiClient.answerCallback(botToken, callbackQueryId, `Approved ${targetName}!`);

    // Edit Admin message
    await TelegramApiClient.editMessage(
      botToken,
      chatId,
      messageId,
      `✅ *Access Granted*\n\n` +
      `User **${targetName}** (\`${targetUserId}\`) has been added to the authorized whitelist.\n` +
      `Approved by: @${from.username || from.first_name}`,
      { parse_mode: 'Markdown' }
    );

    // Notify newly authorized user
    try {
      await TelegramApiClient.sendMessage(
        botToken,
        targetUserId,
        `🎉 *Access Approved!*\n\n` +
        `The administrator has authorized your access to Finance AI.\n` +
        `You can now start recording your expenses or ask financial questions!\n\n` +
        `*Try sending:* \`Spent 500 on lunch\` or \`/summary\``,
        { parse_mode: 'Markdown' }
      );
    } catch {
      // User might have blocked the bot or chat not started
    }
  }

  static async handleAuthDeny(
    botToken: string,
    callbackQueryId: string,
    chatId: number,
    messageId: number,
    data: string,
    from: any
  ): Promise<void> {
    const targetUserId = data.replace('auth_deny:', '');

    await TelegramApiClient.answerCallback(botToken, callbackQueryId, 'Request denied.');

    await TelegramApiClient.editMessage(
      botToken,
      chatId,
      messageId,
      `❌ *Access Denied*\n\nAccess request for User ID \`${targetUserId}\` was declined.\nAction by: @${from.username || from.first_name}`,
      { parse_mode: 'Markdown' }
    );

    try {
      await TelegramApiClient.sendMessage(
        botToken,
        targetUserId,
        `❌ *Access Request Declined*\n\nThe bot owner declined your access request.`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      // Ignore delivery error
    }
  }
}
