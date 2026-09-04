import { Env } from '../../db/types';

export class FinancialQueryService {
  /**
   * Natural Language Financial Query Response Generator
   */
  static async answer(env: Env, queryText: string, contextSummary: string, isGroup = false): Promise<string> {
    const prompt = `You are a helpful personal finance advisor${isGroup ? ' for an office lunch and shared group expense team' : ''}.
Context on current account balances & transaction history:
${contextSummary}

User Question: "${queryText}"

Provide a friendly, concise, human-like response in 2-4 sentences explaining the stats clearly.`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
        }
      }
    } catch (err) {
      console.error('[FinancialQueryService Error]:', err);
    }

    return `Here is your requested finance overview based on your recent records:\n\n${contextSummary}`;
  }
}
