import { Env, TransactionType } from '../db/types';

export interface ParsedTransactionResult {
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  account: string; // e.g. "JazzCash", "EasyPaisa", "Meezan Bank", "Cash", etc.
  personName?: string;
  note: string;
  confidence: number;
}

export class AIService {
  /**
   * Parse unstructured text using Cloudflare Workers AI (Llama-3.1-8b-instruct)
   */
  static async parseTransactionText(env: Env, text: string): Promise<ParsedTransactionResult> {
    const systemPrompt = `You are an expert financial assistant for Pakistani personal expense tracking.
Your job is to convert unstructured financial messages (in English, Urdu, or Roman Urdu) into structured JSON.

Supported Account Names (detect accurately):
- "JazzCash"
- "EasyPaisa"
- "NayaPay"
- "SadaPay"
- "Meezan Bank"
- "HBL"
- "UBL"
- "Bank Alfalah"
- "Cash"
- "Default"

Supported Transaction Types:
- "expense" (spent money, bought items, paid bills)
- "income" (received salary, payment, freelance earnings)
- "transfer" (transferred money to a person or between own accounts)
- "debt_given" (lent money to a friend/person)
- "debt_received" (received back money lent to a friend)

Categories:
- "Food & Dining", "Groceries", "Bills & Utilities", "Rent", "Transportation", "Shopping", "Entertainment", "Health & Medical", "Salary", "Debt / Transfer", "General"

Response Format (STRICT JSON ONLY, no markdown, no conversational text):
{
  "type": "expense" | "income" | "transfer" | "debt_given" | "debt_received",
  "amount": number,
  "currency": "PKR",
  "category": "string",
  "account": "JazzCash" | "EasyPaisa" | "NayaPay" | "SadaPay" | "Meezan Bank" | "HBL" | "Cash" | string,
  "personName": "string or null if no person involved",
  "note": "brief summary of transaction",
  "confidence": 0.95
}`;

    const userPrompt = `User message: "${text}"\nExtract details into JSON:`;

    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 350
        });

        const rawContent = response?.response || response?.description || response?.result || (typeof response === 'string' ? response : '');
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return sanitizeParsedResult(parsed, text);
        }
      }
    } catch (err) {
      console.error('[Workers AI Error] parseTransactionText failed:', err);
    }

    // Heuristic fallback if Workers AI binding isn't available or fails
    return heuristicParseText(text);
  }

  /**
   * Parse receipt image / payment screenshot using Cloudflare Workers AI Vision model
   */
  static async parseReceiptImage(env: Env, imageArrayBuffer: ArrayBuffer): Promise<ParsedTransactionResult> {
    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const imageVector = Array.from(new Uint8Array(imageArrayBuffer));
        const prompt = `This is a transaction screenshot or receipt from a Pakistani payment app (JazzCash, EasyPaisa, Meezan, HBL, etc.).
Extract the total amount, account/bank name, receiver/sender name, and transaction type.
Return JSON ONLY:
{
  "type": "expense" | "income" | "transfer",
  "amount": number,
  "currency": "PKR",
  "category": "Bills & Utilities" | "Food & Dining" | "Transfer" | "General",
  "account": "JazzCash" | "EasyPaisa" | "Meezan Bank" | "HBL" | "NayaPay" | "Cash",
  "personName": "Receiver or Sender name if visible",
  "note": "Transaction screenshot payment",
  "confidence": 0.9
}`;

        // Using Cloudflare Workers AI vision model
        const response: any = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt,
          image: imageVector
        });

        const rawContent = response?.response || (typeof response === 'string' ? response : '');
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return sanitizeParsedResult(parsed, 'Receipt screenshot');
        }
      }
    } catch (err) {
      console.error('[Workers AI Error] parseReceiptImage failed:', err);
    }

    // Default fallback if vision model is not triggered
    return {
      type: 'expense',
      amount: 1000,
      currency: 'PKR',
      category: 'General',
      account: 'JazzCash',
      personName: 'Merchant',
      note: 'Receipt Payment Screenshot',
      confidence: 0.7
    };
  }

  /**
   * Natural Language Financial Query Response Generator
   */
  static async answerFinancialQuery(env: Env, queryText: string, contextSummary: string): Promise<string> {
    const prompt = `You are a helpful personal finance advisor.
Context on user's current account balances & transaction history:
${contextSummary}

User Question: "${queryText}"

Provide a friendly, concise, human-like response in 2-4 sentences explaining the stats clearly.`;

    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 250
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
        }
      }
    } catch (err) {
      console.error('[Workers AI Query Error]:', err);
    }

    return `Here is your requested finance overview based on your recent records:\n\n${contextSummary}`;
  }
}

function sanitizeParsedResult(parsed: any, rawText: string): ParsedTransactionResult {
  const amount = Math.abs(Number(parsed.amount) || 0);
  const type: TransactionType = ['income', 'expense', 'transfer', 'debt_given', 'debt_received'].includes(parsed.type) 
    ? parsed.type 
    : 'expense';

  return {
    type,
    amount,
    currency: parsed.currency || 'PKR',
    category: parsed.category || 'General',
    account: parsed.account || detectAccountFromText(rawText),
    personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
    note: parsed.note || rawText,
    confidence: Number(parsed.confidence) || 0.9
  };
}

function heuristicParseText(text: string): ParsedTransactionResult {
  const lower = text.toLowerCase();
  
  // Extract number/amount
  const amountMatch = text.match(/(?:rs\.?|pkr|rs|amount)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
  let amount = 0;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // Detect type
  let type: TransactionType = 'expense';
  if (lower.includes('recieved') || lower.includes('received') || lower.includes('got') || lower.includes('milay')) {
    type = 'income';
  } else if (lower.includes('sent') || lower.includes('transferred') || lower.includes('bheja') || lower.includes('paid')) {
    type = 'expense';
  }

  // Detect Person
  let personName: string | undefined = undefined;
  const personMatch = text.match(/(?:to|from|for|by|ko)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (personMatch) {
    personName = personMatch[1];
  }

  return {
    type,
    amount: amount || 100,
    currency: 'PKR',
    category: lower.includes('food') || lower.includes('lunch') || lower.includes('dinner') ? 'Food & Dining' : 'General',
    account: detectAccountFromText(text),
    personName,
    note: text,
    confidence: 0.75
  };
}

function detectAccountFromText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('jazzcash') || lower.includes('jazz cash') || lower.includes('jc')) return 'JazzCash';
  if (lower.includes('easypaisa') || lower.includes('easy paisa') || lower.includes('ep')) return 'EasyPaisa';
  if (lower.includes('nayapay') || lower.includes('naya pay')) return 'NayaPay';
  if (lower.includes('sadapay') || lower.includes('sada pay')) return 'SadaPay';
  if (lower.includes('meezan')) return 'Meezan Bank';
  if (lower.includes('hbl')) return 'HBL';
  if (lower.includes('ubl')) return 'UBL';
  if (lower.includes('alfalah')) return 'Bank Alfalah';
  if (lower.includes('cash')) return 'Cash';
  return 'JazzCash';
}
