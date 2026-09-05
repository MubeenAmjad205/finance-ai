import { ParsedTransactionResult } from '../../services/ai';
import { MongoDBClient } from '../../db/mongodb';
import { PersonResolver } from '../../services/personResolver';
import { TemporalResolver } from '../../services/temporalResolver';
import { TelegramApiClient } from '../client/telegramApi';

export class TxPresenter {
  static async presentTransactionConfirmation(
    botToken: string,
    db: MongoDBClient,
    chatId: number,
    parsed: ParsedTransactionResult,
    rawText: string,
    telegramMsgId: number,
    isVoice = false,
    transcription?: string
  ): Promise<void> {
    let personMatchInfo = '';
    let personId: string | undefined = undefined;
    let suggestedPersonId: string | undefined = undefined;

    if (parsed.personName) {
      const resolution = await PersonResolver.resolvePerson(db, parsed.personName);
      if (resolution.matchType === 'exact' && resolution.person) {
        personId = resolution.person._id;
        personMatchInfo = `👤 **Person:** ${resolution.person.name} (Matched)`;
      } else if (resolution.matchType === 'fuzzy_match_suggestion' && resolution.suggestedMatch) {
        suggestedPersonId = resolution.suggestedMatch._id;
        personMatchInfo = `👤 **Person:** ${parsed.personName} *(Suggested Match: ${resolution.suggestedMatch.name})*`;
      } else {
        personMatchInfo = `👤 **Person:** ${parsed.personName} *(New Profile)*`;
      }
    }

    const evidenceHash = await TemporalResolver.generateEvidenceSignature({
      amount: parsed.amount,
      timestamp: new Date().toISOString(),
      note: parsed.note || rawText,
      paidBy: String(chatId)
    });

    const txId = await db.createTransaction({
      type: parsed.type,
      amount: parsed.amount,
      originalAmount: parsed.originalAmount,
      originalCurrency: parsed.originalCurrency,
      exchangeRate: parsed.exchangeRate,
      currency: parsed.currency || 'PKR',
      category: parsed.category,
      account: parsed.account,
      personId,
      personName: parsed.personName,
      note: parsed.note,
      rawText,
      status: 'pending_confirmation',
      timestamp: new Date().toISOString(),
      telegramMessageId: telegramMsgId,
      telegramUserId: chatId,
      isVoiceNote: isVoice,
      voiceTranscription: transcription,
      isHighValue: parsed.isHighValue,
      tags: parsed.tags,
      evidenceHash
    });

    const inlineKeyboard: any[][] = [];

    if (suggestedPersonId && parsed.personName) {
      inlineKeyboard.push([
        {
          text: `🤝 Merge "${parsed.personName}" as existing profile`,
          callback_data: `person_merge:${txId}:${suggestedPersonId}:${parsed.personName}`
        }
      ]);
    }

    inlineKeyboard.push([
      { text: `✅ Confirm & Save`, callback_data: `tx_confirm:${txId}` },
      { text: `🏦 Account: ${parsed.account}`, callback_data: `tx_choose_acc:${txId}` }
    ]);
    inlineKeyboard.push([
      { text: `🏷️ Category: ${parsed.category}`, callback_data: `tx_edit_cat:${txId}` },
      { text: `❌ Cancel`, callback_data: `tx_cancel:${txId}` }
    ]);

    let currencyStr = `${parsed.amount.toLocaleString()} PKR`;
    if (parsed.originalAmount && parsed.originalCurrency) {
      currencyStr = `${parsed.originalAmount} ${parsed.originalCurrency} (~${parsed.amount.toLocaleString()} PKR @ Rate ${parsed.exchangeRate})`;
    }

    let confirmationText = `🔍 **Confirm New Transaction?**
──────────────────────
💰 **Amount:** ${currencyStr} (${parsed.type.toUpperCase()})
🏦 **Payment Account:** ${parsed.account}
🏷️ **Category:** ${parsed.category}
${parsed.personName ? `${personMatchInfo}\n` : ''}📝 **Note:** ${parsed.note || 'None'}`;

    if (parsed.isHighValue) {
      confirmationText = `⚠️ **HIGH-VALUE TRANSACTION ALERT (>50,000 PKR)**\n` +
        `──────────────────────\n` +
        confirmationText +
        `\n\n🛡️ *Please double check the digits before confirming!*`;
    }

    if (isVoice && transcription) {
      confirmationText += `\n🎙️ *Transcribed from Voice Note*`;
    }

    await TelegramApiClient.sendMessage(botToken, chatId, confirmationText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }
}
