import { Env } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';
import { AIService } from '../../services/ai';
import { TelegramApiClient } from '../client/telegramApi';
import { TxPresenter } from './txPresenter';

export class VoiceHandler {
  static async handleVoiceNote(
    env: Env,
    botToken: string,
    db: MongoDBClient,
    chatId: number,
    msg: any
  ): Promise<void> {
    const voiceObj = msg.voice || msg.audio;
    await TelegramApiClient.sendMessage(botToken, chatId, `🎙️ Transcribing voice note with Cloudflare Workers AI Whisper...`);

    const audioBuffer = await TelegramApiClient.downloadFile(botToken, voiceObj.file_id);
    if (audioBuffer) {
      const transcribedText = await AIService.transcribeVoiceNote(env, audioBuffer);
      if (transcribedText) {
        await TelegramApiClient.sendMessage(botToken, chatId, `🗣️ **Transcribed:** "${transcribedText}"`, { parse_mode: 'Markdown' });
        const parsedResult = await AIService.parseTransactionText(env, transcribedText);
        await TxPresenter.presentTransactionConfirmation(botToken, db, chatId, parsedResult, transcribedText, msg.message_id, true, transcribedText);
        return;
      }
    }
    await TelegramApiClient.sendMessage(botToken, chatId, `❌ Could not transcribe voice note. Please try text input.`);
  }
}
