import { Env } from '../../db/types';

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

Provide 3 actionable, highly practical financial tips tailored for Pakistani users (mentioning Meezan Islamic Mutual Funds, Meezan/HBL Savings accounts, Treasury Bills, Gold, or budgeting strategies). Format with bullet points and emojis in a warm, encouraging tone.`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 350
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
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
The user speaks Roman Urdu/Urdu. Reply warmly in natural conversational Roman Urdu (1-2 sentences).
Give an example of how you can record expenses (e.g. "Chai ke 250 Cash se" or "Petrol 2000 Meezan se") or help with hisab.`
      : `You are a friendly personal finance AI assistant for Pakistani users.
User Message: "${sanitizedText}"
Reply in a warm, helpful, human-like tone in 1-2 short sentences. Mention that you can track their expenses, voice notes, receipts, and account balances.`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: sanitizedText }
          ],
          max_tokens: 150
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
        }
      }
    } catch (err) {
      console.error('[AdvisorService Chat Error]:', err);
    }

    if (lang === 'roman_urdu') {
      return `Salam! 👋 Main aapka Finance AI Assistant hoon. Aap mujhe kharcha bata sakte hain jaise *"Tehzeeb par 1450 JazzCash se"* ya voice note bhej sakte hain!`;
    }

    return `Hello! 👋 I am your Personal Finance AI assistant. You can tell me expenses like *"Spent 1450 at Tehzeeb via JazzCash"*, send voice notes, upload receipts, or ask questions!`;
  }
}
