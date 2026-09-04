import { Env } from '../db/types';

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
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
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

  /**
   * Calculate net settlement matrix across group expenses (minimizes total transfers & evens out multi-day balances)
   */
  static calculateNetSettlements(expenses: GroupExpense[]): NetGroupBalance[] {
    const balances: Record<string, number> = {};

    for (const exp of expenses) {
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      
      for (const p of exp.participants) {
        if (p.status === 'unpaid') {
          const debtor = p.username ? `@${p.username}` : p.name;
          if (debtor.toLowerCase() !== payer.toLowerCase()) {
            // Debtor owes payer p.shareAmount
            balances[debtor] = (balances[debtor] || 0) - p.shareAmount;
            balances[payer] = (balances[payer] || 0) + p.shareAmount;
          }
        }
      }
    }

    // Convert balances map to debt pairs
    const debtors: { name: string; amount: number }[] = [];
    const creditors: { name: string; amount: number }[] = [];

    for (const [name, net] of Object.entries(balances)) {
      if (net < -1) debtors.push({ name, amount: Math.abs(net) });
      if (net > 1) creditors.push({ name, amount: net });
    }

    const settlements: NetGroupBalance[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debt = debtors[i];
      const cred = creditors[j];
      const minAmount = Math.min(debt.amount, cred.amount);

      settlements.push({
        fromUser: debt.name,
        toUser: cred.name,
        amount: Math.round(minAmount)
      });

      debt.amount -= minAmount;
      cred.amount -= minAmount;

      if (debt.amount <= 1) i++;
      if (cred.amount <= 1) j++;
    }

    return settlements;
  }

  /**
   * Get detailed breakdown for a specific user (their total paid, total shares, open debts, and net position)
   */
  static getUserFinancialProfile(expenses: GroupExpense[], targetUser: string): {
    normalizedName: string;
    totalPaid: number;
    totalShare: number;
    netBalance: number;
    owesList: { toUser: string; amount: number }[];
    isOwedByList: { fromUser: string; amount: number }[];
  } {
    const cleanTarget = targetUser.trim().replace('@', '').toLowerCase();
    let totalPaid = 0;
    let totalShare = 0;

    for (const exp of expenses) {
      const payerClean = (exp.paidBy.username || exp.paidBy.name).trim().replace('@', '').toLowerCase();
      if (payerClean === cleanTarget) {
        totalPaid += exp.totalAmount;
      }

      for (const p of exp.participants) {
        const pClean = (p.username || p.name).trim().replace('@', '').toLowerCase();
        if (pClean === cleanTarget) {
          totalShare += p.shareAmount;
        }
      }
    }

    const settlements = this.calculateNetSettlements(expenses);
    const owesList: { toUser: string; amount: number }[] = [];
    const isOwedByList: { fromUser: string; amount: number }[] = [];

    let netBalance = 0;

    for (const s of settlements) {
      const fromClean = s.fromUser.trim().replace('@', '').toLowerCase();
      const toClean = s.toUser.trim().replace('@', '').toLowerCase();

      if (fromClean === cleanTarget) {
        owesList.push({ toUser: s.toUser, amount: s.amount });
        netBalance -= s.amount;
      }

      if (toClean === cleanTarget) {
        isOwedByList.push({ fromUser: s.fromUser, amount: s.amount });
        netBalance += s.amount;
      }
    }

    return {
      normalizedName: targetUser.startsWith('@') ? targetUser : `@${targetUser}`,
      totalPaid,
      totalShare,
      netBalance,
      owesList,
      isOwedByList
    };
  }
}

function heuristicGroupParse(text: string, senderName: string) {
  const amountMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
  const totalAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 1000;

  // Extract @mentions excluding bot handles
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
