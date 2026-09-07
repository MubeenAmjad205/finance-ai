import { Env } from '../../db/types';
import { containsDisallowedScript } from './queryService';

export class AdvisorService {
  /**
   * AI Personal Financial Advisor & Savings Tips Generator
   */
  static async generateTips(
    env: Env,
    stats: { totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> },
    accounts: any[]
  ): Promise<string> {
    const netSavings = stats.totalIncome - stats.totalExpense;
    const savingsRate = stats.totalIncome > 0 ? Math.round((netSavings / stats.totalIncome) * 100) : 0;

    const prompt = `You are a top Pakistani personal finance advisor & wealth consultant.
Analyze these monthly user stats:
- Total Income: ${stats.totalIncome} PKR
- Total Expenses: ${stats.totalExpense} PKR
- Net Savings: ${netSavings} PKR (Savings Rate: ${savingsRate}%)
- Category Spending: ${JSON.stringify(stats.categoryBreakdown)}

CRITICAL LANGUAGE RULES:
1. Respond ONLY in English or Roman Urdu using the Latin alphabet (A-Z).
2. NEVER use Gurmukhi, Devanagari, Hindi, Arabic, or Perso-Arabic scripts under any circumstances.

Provide 3 actionable, highly practical financial tips tailored for Pakistani users (mentioning Meezan Islamic Mutual Funds, Meezan/HBL Savings accounts, Treasury Bills, Gold, or budgeting strategies). Format with bullet points and emojis in a warm, encouraging tone.`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-3b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 350
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          const trimmed = reply.trim();
          if (!containsDisallowedScript(trimmed)) {
            return trimmed;
          }
        }
      }
    } catch (err) {
      console.error('[AdvisorService Error]:', err);
    }

    return (
      `💡 **AI Financial Advisor Insights:**\n\n` +
      `1️⃣ **Optimize Dining & Delivery:** Your top spending category is dining. Cooking 2 extra meals a week can save ~8,000 PKR monthly.\n` +
      `2️⃣ **High-Yield Islamic Savings:** Keep your emergency fund in Meezan Sovereign Fund or HBL Islamic Savings for ~19-20% APY.\n` +
      `3️⃣ **Automate Savings:** Move 15% of income into your savings account as soon as salary arrives!`
    );
  }

  /**
   * Conversational Chat Response Generator with Roman Urdu & English Persona
   */
  static async generateChatResponse(env: Env, text: string): Promise<string> {
    const { sanitizedText } = (await import('./promptGuard')).PromptGuard.sanitize(text);
    const { IntentClassifier } = await import('./intentClassifier');
    const lang = IntentClassifier.detectLanguage(sanitizedText);

    const systemPrompt = lang === 'roman_urdu'
      ? `You are an authentic, smart Pakistani personal finance AI buddy.
The user is speaking in Roman Urdu. Respond directly, concisely (1-2 sentences), and conversationally to their specific message using Latin/English alphabet ONLY. NEVER use Gurmukhi, Devanagari, or Arabic script.
CRITICAL ACTION RULE: You are ONLY a conversational chat buddy. You CANNOT log, record, or save transactions or alter account balances. NEVER tell the user that you have logged, saved, or recorded any transaction. If the user wants to log an expense or income, instruct them to specify the amount and account.`
      : `You are a friendly and smart personal finance AI assistant for Pakistani users.
Respond directly, concisely (1-2 sentences), and conversationally to the user's specific statement or question in English using the standard English alphabet ONLY. NEVER use Gurmukhi, Devanagari, or foreign script.
CRITICAL ACTION RULE: You are ONLY a conversational companion. You CANNOT log, record, or save transactions or alter account balances. NEVER tell the user that you have logged, saved, or recorded any transaction. If the user wants to log an expense or income, instruct them to specify the amount and account.`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-3b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: sanitizedText }
          ],
          max_tokens: 150
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          const trimmed = reply.trim();
          if (!containsDisallowedScript(trimmed)) {
            return trimmed;
          }
        }
      }
    } catch (err) {
      console.error('[AdvisorService Chat Error]:', err);
    }

    const lower = sanitizedText.toLowerCase();
    const isGreeting = lower === 'hi' || lower === 'hello' || lower === 'salam' || lower === 'hey' || lower.startsWith('salam') || lower.startsWith('hi ');

    if (isGreeting) {
      if (lang === 'roman_urdu') {
        return `Salam! 👋 Main aapka Finance AI Assistant hoon. Aap mujhe kharcha bata sakte hain jaise *"Tehzeeb par 1450 JazzCash se"* ya voice note bhej sakte hain!`;
      }
      return `Hello! 👋 I am your Personal Finance AI assistant. You can tell me expenses like *"Spent 1450 at Tehzeeb via JazzCash"*, send voice notes, upload receipts, or ask questions!`;
    }

    if (lang === 'roman_urdu') {
      return `Ji samajh gaya! Aap transactions log kar sakte hain (e.g. *"500 JazzCash se"*), balances dekh sakte hain (/accounts), ya koi bhi sawal pooch sakte hain.`;
    }

    return `Got it! You can log expenses (e.g. *"Spent 500 via JazzCash"*), view balances with \`/accounts\`, or ask me any question.`;
  }
}
