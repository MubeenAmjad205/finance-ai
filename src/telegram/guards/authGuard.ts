import { Env } from '../../db/types';

export interface AuthCheckResult {
  isAuthorized: boolean;
  reason?: string;
}

export class TelegramAuthGuard {
  /**
   * Check whether an incoming Telegram update is authorized to access the personal bot
   * @param env Environment variables containing TELEGRAM_ALLOWED_USER_IDS or TELEGRAM_CHAT_ID
   * @param userId Telegram user ID (from.id)
   * @param chatId Telegram chat ID (chat.id)
   */
  static isAuthorized(env: Env, userId?: number | string, chatId?: number | string): AuthCheckResult {
    const rawAllowed = env.TELEGRAM_ALLOWED_USER_IDS?.trim();
    const primaryChatId = env.TELEGRAM_CHAT_ID?.trim();

    // If neither allowed IDs nor primary chat ID is configured, allow (open/development mode)
    if (!rawAllowed && !primaryChatId) {
      return { isAuthorized: true };
    }

    const allowedSet = new Set<string>();

    if (rawAllowed) {
      rawAllowed.split(',').forEach(id => {
        const clean = id.trim();
        if (clean) allowedSet.add(clean);
      });
    }

    if (primaryChatId) {
      allowedSet.add(primaryChatId);
    }

    const strUserId = userId ? String(userId) : '';
    const strChatId = chatId ? String(chatId) : '';

    if ((strUserId && allowedSet.has(strUserId)) || (strChatId && allowedSet.has(strChatId))) {
      return { isAuthorized: true };
    }

    return {
      isAuthorized: false,
      reason: '🔒 *Access Denied: Private Bot*\n\nThis personal finance assistant is configured for private use. Your Telegram User ID is not on the authorized whitelist.'
    };
  }

  /**
   * Asynchronous check evaluating static environment variables AND dynamic MongoDB whitelist
   */
  static async isAuthorizedAsync(
    env: Env,
    db: { whitelist: { isWhitelisted: (id: string | number) => Promise<boolean> } },
    userId?: number | string,
    chatId?: number | string
  ): Promise<AuthCheckResult> {
    // 1. Check static bootstrap environment variables
    const staticCheck = this.isAuthorized(env, userId, chatId);
    if (staticCheck.isAuthorized) {
      return staticCheck;
    }

    // 2. Check dynamic MongoDB whitelist
    if (userId) {
      const userWhitelisted = await db.whitelist.isWhitelisted(userId);
      if (userWhitelisted) {
        return { isAuthorized: true };
      }
    }

    if (chatId) {
      const chatWhitelisted = await db.whitelist.isWhitelisted(chatId);
      if (chatWhitelisted) {
        return { isAuthorized: true };
      }
    }

    return {
      isAuthorized: false,
      reason: '🔒 *Access Restricted*\n\nThis personal finance assistant is configured for private use. Your Telegram User ID is not on the authorized whitelist.'
    };
  }
}
