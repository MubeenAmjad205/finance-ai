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
        `📸 **Receipt Details Unclear**\n\nWorkers AI Vision could not extract a definitive amount from this receipt.\n\n*Please log it manually:* e.g. \`Spent 1450 at Tehzeeb via JazzCash\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await TxPresenter.presentTransactionConfirmation(botToken, db, chatId, parsedResult, text || 'Receipt Screenshot', msg.message_id);
  }
}
