export class TelegramApiClient {
  /**
   * Send a text message to a Telegram chat with automatic entity fallback
   */
  static async sendMessage(
    botToken: string,
    chatId: number | string,
    text: string,
    options: Record<string, any> = {}
  ): Promise<Response | null> {
    if (!botToken) return null;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = { chat_id: chatId, text, ...options };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[TelegramApiClient.sendMessage Error]:', res.status, errText);
      if (options.parse_mode && errText.includes("Can't parse entities")) {
        console.warn('[TelegramApiClient.sendMessage Fallback]: Resending without parse_mode');
        const fallbackOptions = { ...options };
        delete fallbackOptions.parse_mode;
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, ...fallbackOptions })
        });
      }
    }
    return res;
  }

  /**
   * Edit an existing message in a Telegram chat with automatic fallback
   */
  static async editMessage(
    botToken: string,
    chatId: number | string,
    messageId: number,
    text: string,
    options: Record<string, any> = {}
  ): Promise<Response | null> {
    if (!botToken) return null;
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[TelegramApiClient.editMessage Error]:', res.status, errText);
      if (options.parse_mode && errText.includes("Can't parse entities")) {
        console.warn('[TelegramApiClient.editMessage Fallback]: Resending without parse_mode');
        const fallbackOptions = { ...options };
        delete fallbackOptions.parse_mode;
        return await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text,
            ...fallbackOptions
          })
        });
      }
    }
    return res;
  }

  /**
   * Answer an interactive callback query
   */
  static async answerCallback(
    botToken: string,
    callbackQueryId: string,
    text: string,
    showAlert = false
  ): Promise<Response | null> {
    if (!botToken) return null;
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert })
    });
  }

  /**
   * Download a file from Telegram servers into an ArrayBuffer
   */
  static async downloadFile(botToken: string, fileId: string): Promise<ArrayBuffer | null> {
    if (!botToken) return null;
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const fileData: any = await fileRes.json();
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path;
        const mediaRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
        return await mediaRes.arrayBuffer();
      }
    } catch (err) {
      console.error('[TelegramApiClient.downloadFile Exception]:', err);
    }
    return null;
  }
}
