import { Env } from '../../db/types';
import { TemporalResolver } from '../temporalResolver';
import { PromptGuard } from './promptGuard';
import { IntentClassifier } from './intentClassifier';

/**
 * Checks if the text contains non-Latin scripts such as:
 * Gurmukhi, Devanagari, Arabic/Urdu, Cyrillic, Thai, Chinese, etc.
 */
export function containsDisallowedScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u0DFF\u0E00-\u0E7F\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF]/.test(text);
}

export class FinancialQueryService {
  /**
   * Natural Language Financial Query Response Generator
   */
  static async answer(env: Env, queryText: string, contextSummary: string, isGroup = false): Promise<string> {
    const { sanitizedText } = PromptGuard.sanitize(queryText);
    const temporal = TemporalResolver.getCurrentContext();
    const lang = IntentClassifier.detectLanguage(sanitizedText);

    const systemPrompt = lang === 'roman_urdu'
      ? `You are an intelligent, friendly personal finance assistant for users in Pakistan.
CRITICAL LANGUAGE & DATA RULES:
1. You must respond ONLY in Roman Urdu (Urdu written using the standard English/Latin alphabet A-Z).
2. NEVER use Gurmukhi, Punjabi script, Devanagari, Hindi, Arabic, or Urdu script under ANY circumstances.
3. Use Latin alphabet (A-Z, a-z), numbers, and standard emojis only.
4. Answer the user's specific question directly, concisely, and warmly in 1-2 sentences.
5. If the user asks about an account balance (e.g. JazzCash, EasyPaisa, UBL):
   - Agar account FINANCIAL DATA list mein hai, to uska exact balance bata dein.
   - Agar account FINANCIAL DATA list mein nahi hai, to saaf batayein ke yeh account abhi add nahi hua, maujooda accounts batayein, aur batayein ke \`/setbalance <Account> <Amount>\` se add kar sakte hain.
   - NEVER tell the user to visit a branch or check external banking apps. You are their local ledger.
6. Use PKR as currency.`
      : `You are an intelligent, friendly personal finance assistant for users in Pakistan.
CRITICAL LANGUAGE & DATA RULES:
1. You must respond ONLY in clear, natural English using the standard English/Latin alphabet (A-Z).
2. NEVER use Gurmukhi, Punjabi script, Devanagari, Hindi, Arabic, or Urdu script under ANY circumstances.
3. Use Latin alphabet (A-Z, a-z), numbers, and standard emojis only.
4. Answer the user's specific question directly, concisely, and warmly in 1-2 sentences.
5. If the user asks about an account balance (e.g. JazzCash, EasyPaisa, UBL):
   - If the account is present in the FINANCIAL DATA list, state its exact balance clearly.
   - If the account is NOT present in the FINANCIAL DATA list, state clearly that it is not registered yet, state which accounts are currently recorded, and explain that they can register it by saying "Set <Account> balance <Amount>" (e.g. "Set UBL balance 5000").
   - NEVER say you don't have access to real-time information or tell the user to check online banking or visit a bank branch. You are their local expense and account ledger.
6. Use PKR as currency.`;

    const userPrompt = `${temporal.promptContext}

FINANCIAL DATA & ACCOUNT BALANCES:
${contextSummary}

USER'S QUESTION: "${sanitizedText}"

Answer directly in ${lang === 'roman_urdu' ? 'Roman Urdu (using English letters only)' : 'English'}:`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-3b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 250
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          const trimmed = reply.trim();
          // Verify that reply has NO Gurmukhi, Devanagari, Arabic, or foreign scripts
          if (!containsDisallowedScript(trimmed)) {
            return trimmed;
          }
        }
      }
    } catch (err) {
      console.error('[FinancialQueryService Error]:', err);
    }

    // Deterministic fallback if model produces foreign script or fails
    const lower = sanitizedText.toLowerCase();
    if (lower.includes('jazzcash') || lower.includes('jazz cash')) {
      const match = contextSummary.match(/JazzCash:\s*([\d,]+(?:\.\d+)?)\s*PKR/i);
      const bal = match ? match[1] : '0';
      return lang === 'roman_urdu'
        ? `Aapka JazzCash balance **${bal} PKR** hai.`
        : `Your current JazzCash balance is **${bal} PKR**.`;
    }
    if (lower.includes('easypaisa') || lower.includes('easy paisa')) {
      const match = contextSummary.match(/EasyPaisa:\s*([\d,]+(?:\.\d+)?)\s*PKR/i);
      const bal = match ? match[1] : '0';
      return lang === 'roman_urdu'
        ? `Aapka EasyPaisa balance **${bal} PKR** hai.`
        : `Your current EasyPaisa balance is **${bal} PKR**.`;
    }

    return lang === 'roman_urdu'
      ? `📊 **Maliati Jaiza:**\n\n${contextSummary}`
      : `📊 **Financial Status:**\n\n${contextSummary}`;
  }
}
