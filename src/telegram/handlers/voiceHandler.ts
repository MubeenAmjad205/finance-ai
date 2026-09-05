import { Env } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';
import { AIService } from '../../services/ai';
import { TelegramApiClient } from '../client/telegramApi';
import { TxPresenter } from './txPresenter';

import { MemoryService } from '../../services/ai/memoryService';

export class VoiceHandler {
  static async handleVoiceNote(
    env: Env,
    botToken: string,
    db: MongoDBClient,
    chatId: number,
    msg: any,
    onTextMessage?: (text: string) => Promise<void>
  ): Promise<void> {
    const voiceObj = msg.voice || msg.audio;
    await TelegramApiClient.sendMessage(botToken, chatId, `🎙️ Transcribing voice note with Cloudflare Workers AI Whisper...`);

    const audioBuffer = await TelegramApiClient.downloadFile(botToken, voiceObj.file_id);
    if (audioBuffer) {
      const transcribedText = await AIService.transcribeVoiceNote(env, audioBuffer);
      if (transcribedText) {
        await TelegramApiClient.sendMessage(botToken, chatId, `🗣️ **Transcribed:** "${transcribedText}"`, { parse_mode: 'Markdown' });

        if (onTextMessage) {
          await onTextMessage(transcribedText);
          return;
        }

        const intent = AIService.detectMessageIntent(transcribedText);
        if (intent === 'chat') {
          const greeting = await AIService.generateChatResponse(env, transcribedText);
          await TelegramApiClient.sendMessage(botToken, chatId, greeting, { parse_mode: 'Markdown' });
          return;
        }

        if (intent === 'question') {
          const currentMonth = new Date().toISOString().substring(0, 7);
          const stats = await db.getMonthlyStats(currentMonth);
          const memoryCtx = MemoryService.getStructuredMemoryContext(chatId);
          const answer = await AIService.answerFinancialQuery(env, transcribedText, `${JSON.stringify(stats)}\n\n${memoryCtx}`);
          await TelegramApiClient.sendMessage(botToken, chatId, answer, { parse_mode: 'Markdown' });
          return;
        }

        const parsedResult = await AIService.parseTransactionText(env, transcribedText);
        await TxPresenter.presentTransactionConfirmation(botToken, db, chatId, parsedResult, transcribedText, msg.message_id, true, transcribedText);
        return;
      }
    }
    await TelegramApiClient.sendMessage(botToken, chatId, `❌ Could not transcribe voice note. Please try text input.`);
  }
}
