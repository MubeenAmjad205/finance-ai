import { Env } from '../db/types';
import { AIService, ParsedTransactionResult } from './ai';

export interface ParsedStatementItem {
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  account: string;
  category: string;
}

export class PDFStatementParser {
  /**
   * Parse extracted raw text lines from uploaded PDF bank statement (Meezan, HBL, JazzCash, EasyPaisa)
   */
  static async parseStatementText(env: Env, statementRawText: string, accountName = 'Meezan Bank'): Promise<ParsedStatementItem[]> {
    const prompt = `You are a financial statement analyzer.
Extract transaction rows from this bank/wallet statement text.
Detect date, description, transaction type (income/expense), and amount.

Statement Text:
"${statementRawText.substring(0, 3000)}"

Return JSON Array ONLY:
[
  {
    "date": "YYYY-MM-DD",
    "description": "string",
    "amount": number,
    "type": "expense" | "income",
    "category": "Food & Dining" | "Bills & Utilities" | "Groceries" | "Transfer" | "General"
  }
]`;

    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 1000
        });

        const rawContent = response?.response || (typeof response === 'string' ? response : '');
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const items: any[] = JSON.parse(jsonMatch[0]);
          return items.map(item => ({
            date: item.date || new Date().toISOString().substring(0, 10),
            description: item.description || 'Bank Statement Entry',
            amount: Math.abs(Number(item.amount) || 0),
            type: item.type === 'income' ? 'income' : 'expense',
            account: accountName,
            category: item.category || 'General'
          }));
        }
      }
    } catch (err) {
      console.error('[Workers AI PDF Statement Parser Error]:', err);
    }

    // Heuristic fallback parser
    return heuristicParseStatementLines(statementRawText, accountName);
  }
}

function heuristicParseStatementLines(text: string, accountName: string): ParsedStatementItem[] {
  const lines = text.split('\n');
  const results: ParsedStatementItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Search for pattern: Date + Description + Amount
    const dateMatch = trimmed.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/);
    const amountMatch = trimmed.match(/(\d+(?:,\d+)*(?:\.\d{2})?)/);

    if (dateMatch && amountMatch) {
      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (amount > 0) {
        const isCredit = trimmed.toLowerCase().includes('cr') || trimmed.toLowerCase().includes('deposit');
        results.push({
          date: dateMatch[1],
          description: trimmed.substring(0, 50),
          amount,
          type: isCredit ? 'income' : 'expense',
          account: accountName,
          category: 'General'
        });
      }
    }
  }

  return results.slice(0, 10);
}
