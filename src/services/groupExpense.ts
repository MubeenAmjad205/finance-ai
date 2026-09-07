import { Env } from '../db/types';
import { SettlementCalculator } from './group/settlementCalculator';

export interface GroupExpenseParticipant {
  userId?: number;
  username?: string;
  name: string;
  shareAmount: number;
  status: 'unpaid' | 'paid';
  paidTimestamp?: string;
}

export interface GroupExpense {
  _id?: string;
  billCode?: string; // Short human-friendly ID (e.g. B-7489)
  groupId: number | string;
  groupTitle?: string;
  totalAmount: number;
  paidBy: {
    userId?: number;
    username?: string;
    name: string;
  };
  note: string;
  participants: GroupExpenseParticipant[];
  timestamp: string;
  evidenceHash?: string; // HMAC-SHA256 tamper-detection signature
}

export function generateBillCode(): string {
  const code = Math.floor(1000 + Math.random() * 9000);
  return `B-${code}`;
}

export interface NetGroupBalance {
  fromUser: string;
  toUser: string;
  amount: number;
}

export function isBotHandle(name: string): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase().replace('@', '');
  return clean === 'quantum_lunch_bot' ||
         clean === 'quantum_finance_bot' ||
         clean.endsWith('_bot') ||
         clean === 'bot' ||
         clean.endsWith('lunch_bot');
}

export class GroupExpenseService {
  /**
   * Parse group expense text using Cloudflare Workers AI
   * Example: "Ali paid 5600 for lunch for @usman, @bilal, @hamza, @mubeen"
   */
  static async parseGroupExpenseMessage(env: Env, text: string, senderName = 'Sender'): Promise<{
    totalAmount: number;
    paidByName: string;
    note: string;
    participantNames: string[];
  }> {
    const prompt = `Extract group lunch bill expense details from this message:
Message: "${text}"

Sender Name: "${senderName}"

CRITICAL INSTRUCTION:
- Exclude the bot itself (e.g. @quantum_lunch_bot or any bot handle mentioned to command the bot) from participantNames.
- participantNames must ONLY include human office colleagues sharing the cost.

Return STRICT JSON ONLY:
{
  "totalAmount": number,
  "paidByName": "string (who paid the total bill)",
  "note": "brief summary (e.g. Tehzeeb Lunch / Foodpanda)",
  "participantNames": ["@username1", "@username2", "Name3"]
}`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-3b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 300
        });

        const rawContent = response?.response || (typeof response === 'string' ? response : '');
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawParticipants = Array.isArray(parsed.participantNames) && parsed.participantNames.length > 0
            ? parsed.participantNames
            : [senderName];
          const participantNames = rawParticipants.filter((n: string) => !isBotHandle(n));

          return {
            totalAmount: Math.abs(Number(parsed.totalAmount) || 0),
            paidByName: parsed.paidByName || senderName,
            note: parsed.note || 'Office Lunch',
            participantNames: participantNames.length > 0 ? participantNames : [senderName]
          };
        }
      }
    } catch (err) {
      console.error('[Workers AI Group Expense Parse Error]:', err);
    }

    // Heuristic fallback
    return heuristicGroupParse(text, senderName);
  }

  static calculateNetSettlements(expenses: GroupExpense[]): NetGroupBalance[] {
    return SettlementCalculator.calculateNetSettlements(expenses);
  }

  static getUserFinancialProfile(expenses: GroupExpense[], targetUser: string) {
    return SettlementCalculator.getUserFinancialProfile(expenses, targetUser);
  }
}

function heuristicGroupParse(text: string, senderName: string) {
  const amountMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
  const totalAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

  const mentions = (text.match(/@[A-Za-z0-9_]+/g) || [])
    .filter(m => !isBotHandle(m));

  const rawParticipants = Array.from(new Set([...mentions, senderName]));
  const participantNames = rawParticipants.filter(n => !isBotHandle(n));

  return {
    totalAmount,
    paidByName: senderName,
    note: 'Office Lunch',
    participantNames: participantNames.length > 0 ? participantNames : [senderName]
  };
}
