import { Env } from '../../db/types';
import { MongoDBClient, GroupMongoDBClient } from '../../db/mongodb';
import { TelegramApiClient } from '../client/telegramApi';

export class WhitelistCommands {
  /**
   * Handle personal bot /whitelist command
   */
  static async handlePersonalWhitelist(
    db: MongoDBClient,
    env: Env,
    args: string,
    fromId: number | string,
    senderName = 'Admin'
  ): Promise<string> {
    const parts = args.trim().split(/\s+/);
    const subCommand = parts[0]?.toLowerCase();

    if (!subCommand || subCommand === 'list') {
      const dynamicEntries = await db.whitelist.getAll();
      const envAllowed = env.TELEGRAM_ALLOWED_USER_IDS?.trim() || 'None';
      const primaryChat = env.TELEGRAM_CHAT_ID?.trim() || 'None';

      let out = `🛡️ **TELEGRAM AUTHORIZATION WHITELIST**\n`;
      out += `──────────────────────\n`;
      out += `👑 **Master Bootstrap Config:**\n`;
      out += `• \`TELEGRAM_ALLOWED_USER_IDS\`: \`${envAllowed}\`\n`;
      out += `• \`TELEGRAM_CHAT_ID\`: \`${primaryChat}\`\n\n`;

      out += `👥 **Dynamic Database Whitelist (${dynamicEntries.length} users):**\n`;
      if (dynamicEntries.length === 0) {
        out += `  • No dynamic users authorized yet.\n`;
      } else {
        dynamicEntries.forEach(entry => {
          const name = entry.firstName || entry.username || 'User';
          out += `  • **${name}** (\`${entry.userId}\`) — added by \`${entry.addedBy}\` (${entry.chatType})\n`;
        });
      }

      out += `\n💡 **Usage:**\n`;
      out += `• \`/whitelist add <userId> [Name]\`\n`;
      out += `• \`/whitelist remove <userId>\``;
      return out;
    }

    if (subCommand === 'add') {
      const targetId = parts[1];
      const targetName = parts.slice(2).join(' ') || `User ${targetId}`;
      if (!targetId || !/^\d+$/.test(targetId)) {
        return `⚠️ **Invalid Usage:** \`/whitelist add <Numeric_User_ID> [Name]\`\n\n*Example:* \`/whitelist add 123456789 Ali\``;
      }

      await db.whitelist.add({
        userId: targetId,
        firstName: targetName,
        addedBy: String(fromId),
        chatType: 'personal'
      });

      return `✅ **Authorized:** User **${targetName}** (\`${targetId}\`) is now whitelisted to use Finance AI!`;
    }

    if (subCommand === 'remove' || subCommand === 'del') {
      const targetId = parts[1];
      if (!targetId) {
        return `⚠️ **Invalid Usage:** \`/whitelist remove <Numeric_User_ID>\``;
      }

      const removed = await db.whitelist.remove(targetId);
      if (removed) {
        return `🗑️ **Revoked:** User \`${targetId}\` has been removed from the whitelist.`;
      }
      return `ℹ️ User \`${targetId}\` was not found in the dynamic whitelist.`;
    }

    return `⚠️ Unknown whitelist command. Use \`/whitelist\`, \`/whitelist add <id>\`, or \`/whitelist remove <id>\`.`;
  }

  /**
   * Handle group bot /whitelist command
   */
  static async handleGroupWhitelist(
    botToken: string,
    env: Env,
    db: GroupMongoDBClient,
    chatId: number,
    msg: any,
    args: string,
    sender: any
  ): Promise<void> {
    const senderId = sender?.id ? String(sender.id) : '';
    const masterAllowed = env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(s => s.trim()) || [];
    const masterChat = env.TELEGRAM_CHAT_ID?.trim();

    // Check if sender is master admin or group admin
    const isMasterAdmin = masterAllowed.includes(senderId) || masterChat === senderId;
    let isGroupAdmin = isMasterAdmin;

    if (!isGroupAdmin) {
      try {
        const checkUrl = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${senderId}`;
        const res = await fetch(checkUrl);
        const data: any = await res.json();
        const status = data?.result?.status;
        if (status === 'creator' || status === 'administrator') {
          isGroupAdmin = true;
        }
      } catch {
        // Fallback: allow if master admin
      }
    }

    if (!isGroupAdmin) {
      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `⛔ **Permission Denied:** Only Telegram group administrators can manage the authorized whitelist.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const parts = args.trim().split(/\s+/);
    const subCommand = parts[0]?.toLowerCase();

    // 1. Check if replying to someone's message
    const replyMsg = msg.reply_to_message;
    if (replyMsg && replyMsg.from) {
      const targetUser = replyMsg.from;
      const targetId = String(targetUser.id);
      const targetName = targetUser.first_name || targetUser.username || `User ${targetId}`;

      if (subCommand === 'remove' || subCommand === 'del') {
        await db.whitelist.remove(targetId);
        await TelegramApiClient.sendMessage(
          botToken,
          chatId,
          `🗑️ **Access Revoked:** **${targetName}** (\`${targetId}\`) is no longer authorized.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Default for reply is add/authorize
      await db.whitelist.add({
        userId: targetId,
        username: targetUser.username,
        firstName: targetName,
        addedBy: sender?.username ? `@${sender.username}` : sender?.first_name || senderId,
        chatType: 'group'
      });

      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `✅ **User Authorized!**\n\n` +
        `👤 **Name:** ${targetName} ${targetUser.username ? `(@${targetUser.username})` : ''}\n` +
        `🆔 **User ID:** \`${targetId}\`\n` +
        `Authorized by Admin: @${sender?.username || sender?.first_name}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // 2. Direct subcommands without reply
    if (!subCommand || subCommand === 'list') {
      const dynamicEntries = await db.whitelist.getAll();
      let out = `🛡️ **GROUP AUTHORIZED MEMBERS**\n`;
      out += `──────────────────────\n`;
      out += `Whitelisted members who can log expenses and participate:\n\n`;

      if (dynamicEntries.length === 0) {
        out += `  • No dynamic members registered yet.\n`;
      } else {
        dynamicEntries.forEach(entry => {
          const name = entry.firstName || entry.username || 'Member';
          out += `  • **${name}** (\`${entry.userId}\`)\n`;
        });
      }

      out += `\n💡 **Admin Tips:**\n`;
      out += `• Reply to any message with \`/whitelist add\`\n`;
      out += `• Or type: \`/whitelist add <userId> [Name]\``;

      await TelegramApiClient.sendMessage(botToken, chatId, out, { parse_mode: 'Markdown' });
      return;
    }

    if (subCommand === 'add') {
      const targetId = parts[1];
      const targetName = parts.slice(2).join(' ') || `Member ${targetId}`;
      if (!targetId || !/^\d+$/.test(targetId)) {
        await TelegramApiClient.sendMessage(
          botToken,
          chatId,
          `⚠️ **Usage:** Reply to a user's message with \`/whitelist add\` OR type \`/whitelist add <Numeric_ID> [Name]\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await db.whitelist.add({
        userId: targetId,
        firstName: targetName,
        addedBy: sender?.username ? `@${sender.username}` : sender?.first_name || senderId,
        chatType: 'group'
      });

      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `✅ **Member Authorized:** **${targetName}** (\`${targetId}\`) added to the group whitelist!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (subCommand === 'remove' || subCommand === 'del') {
      const targetId = parts[1];
      if (!targetId) {
        await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ **Usage:** \`/whitelist remove <userId>\``);
        return;
      }

      const removed = await db.whitelist.remove(targetId);
      if (removed) {
        await TelegramApiClient.sendMessage(botToken, chatId, `🗑️ **Access Revoked:** \`${targetId}\` was removed from the whitelist.`);
      } else {
        await TelegramApiClient.sendMessage(botToken, chatId, `ℹ️ User \`${targetId}\` was not found in the whitelist.`);
      }
      return;
    }

    await TelegramApiClient.sendMessage(botToken, chatId, `⚠️ Unknown whitelist command. Use \`/whitelist\`, \`/whitelist add\`, or \`/whitelist remove\`.`);
  }
}
