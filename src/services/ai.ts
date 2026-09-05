import { Env } from '../db/types';
import { CurrencyService, DEFAULT_EXCHANGE_RATES } from './ai/currencyService';
import { IntentClassifier, MessageIntent } from './ai/intentClassifier';
import { TransactionTextParser, ParsedTransactionResult } from './ai/textParser';
import { VoiceTranscriptionService } from './ai/voiceService';
import { VisionReceiptService } from './ai/visionService';
import { AdvisorService } from './ai/advisorService';
import { FinancialQueryService } from './ai/queryService';

export { ParsedTransactionResult, MessageIntent, DEFAULT_EXCHANGE_RATES };

/**
 * Unified AIService Facade delegating to specialized modular AI engines.
 */
export class AIService {
  static detectMessageIntent(text: string): MessageIntent {
    return IntentClassifier.detect(text);
  }

  static detectLanguage(text: string): 'roman_urdu' | 'english' {
    return IntentClassifier.detectLanguage(text);
  }

  static async generateFinancialAdvisorTips(
    env: Env,
    stats: { totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> },
    accounts: any[]
  ): Promise<string> {
    return AdvisorService.generateTips(env, stats, accounts);
  }

  static async generateChatResponse(env: Env, text: string): Promise<string> {
    return AdvisorService.generateChatResponse(env, text);
  }

  static async transcribeVoiceNote(env: Env, audioBuffer: ArrayBuffer): Promise<string> {
    return VoiceTranscriptionService.transcribe(env, audioBuffer);
  }

  static async transcribeAudio(env: Env, audioBuffer: ArrayBuffer): Promise<string> {
    return VoiceTranscriptionService.transcribe(env, audioBuffer);
  }

  static async parseTransactionText(env: Env, text: string): Promise<ParsedTransactionResult> {
    return TransactionTextParser.parse(env, text);
  }

  static async parseCompoundExpenses(env: Env, text: string): Promise<ParsedTransactionResult[]> {
    return TransactionTextParser.parseCompoundExpenses(env, text);
  }

  static async parseReceiptImage(env: Env, imageArrayBuffer: ArrayBuffer): Promise<ParsedTransactionResult | null> {
    return VisionReceiptService.parseReceipt(env, imageArrayBuffer);
  }

  static async answerFinancialQuery(env: Env, queryText: string, contextSummary: string, isGroup = false): Promise<string> {
    return FinancialQueryService.answer(env, queryText, contextSummary, isGroup);
  }

  static convertCurrencyToPkr(amount: number, currency: string) {
    return CurrencyService.convertToPkr(amount, currency);
  }
}
