import { Env } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';
import { AIService } from '../../services/ai';
import { TelegramApiClient } from '../client/telegramApi';
import { TxPresenter } from './txPresenter';

export class PhotoHandler {
  static async handlePhotoReceipt(
    env: Env,
    botToken: string,
    db: MongoDBClient,
    chatId: number,
    msg: any,
    text: string
  ): Promise<void> {
    await TelegramApiClient.sendMessage(botToken, chatId, `🔍 Processing receipt screenshot with Workers AI Vision...`);
    const highestResPhoto = msg.photo[msg.photo.length - 1];
    const imageBuffer = await TelegramApiClient.downloadFile(botToken, highestResPhoto.file_id);

    if (!imageBuffer) {
      await TelegramApiClient.sendMessage(botToken, chatId, `❌ Could not download receipt image. Please try sending it again.`);
      return;
    }

    const parsedResult = await AIService.parseReceiptImage(env, imageBuffer);
    if (!parsedResult) {
      await TelegramApiClient.sendMessage(
        botToken,
        chatId,
        `📸 **Receipt Details Unclear**\n\nWorkers AI Vision could not extract a definitive transaction amount from this image.\n\n💡 *Tip: Ensure the total amount and merchant name are clearly lit, or log manually:* \`Spent 500 on groceries via JazzCash\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await TxPresenter.presentTransactionConfirmation(botToken, db, chatId, parsedResult, text || 'Receipt Screenshot', msg.message_id);
  }
}
