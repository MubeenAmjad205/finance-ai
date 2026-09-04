import { Env, TransactionType } from '../../db/types';
import { CurrencyService } from './currencyService';

export interface ParsedTransactionResult {
  type: TransactionType;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  currency: string;
  category: string;
  account: string;
  personName?: string;
  note: string;
  tags?: string[];
  confidence: number;
}

export class TransactionTextParser {
  static async parse(env: Env, text: string): Promise<ParsedTransactionResult> {
    const systemPrompt = `You are an expert financial assistant for Pakistani personal expense tracking.
Convert unstructured financial messages (English, Urdu, Roman Urdu) into structured JSON.

Supported Accounts:
- "JazzCash", "EasyPaisa", "NayaPay", "SadaPay", "Meezan Bank", "HBL", "UBL", "Bank Alfalah", "Cash", "Default"

Supported Currencies:
- "PKR", "USD", "EUR", "GBP", "AED", "SAR"

Supported Transaction Types:
- "expense", "income", "transfer", "debt_given", "debt_received"

Categories:
- "Food & Dining", "Groceries", "Bills & Utilities", "Rent", "Transportation", "Shopping", "Entertainment", "Health & Medical", "Salary", "Freelance", "Debt / Transfer", "General"

Response Format (STRICT JSON ONLY, no markdown, no conversational text):
{
  "type": "expense" | "income" | "transfer" | "debt_given" | "debt_received",
  "amount": number,
  "currency": "PKR" | "USD" | "EUR" | "GBP" | "AED" | "SAR",
  "category": "string",
  "account": "JazzCash" | "EasyPaisa" | "NayaPay" | "SadaPay" | "Meezan Bank" | "HBL" | "Cash" | string,
  "personName": "string or null",
  "note": "brief summary",
  "tags": ["#Tag1"],
  "confidence": 0.95
}`;

    const userPrompt = `User message: "${text}"\nExtract details into JSON:`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 350
        });

        const rawContent =
          response?.response ||
          response?.description ||
          response?.result ||
          (typeof response === 'string' ? response : '');

        const parsed = this.extractJsonObject(rawContent);
        if (parsed) {
          return this.sanitizeParsedResult(parsed, text);
        }
      }
    } catch (err) {
      console.error('[TransactionTextParser Error]:', err);
    }

    return this.heuristicParse(text);
  }

  private static extractJsonObject(raw: string): any | null {
    if (!raw) return null;

    // First try standard JSON.parse
    try {
      return JSON.parse(raw.trim());
    } catch {
      // Look for first '{' and matching '}'
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = raw.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // Ignore parse failure
        }
      }
    }
    return null;
  }

  private static sanitizeParsedResult(parsed: any, rawText: string): ParsedTransactionResult {
    const rawAmount = Math.abs(Number(parsed.amount) || 0);
    const origCurrency = (parsed.currency || 'PKR').toUpperCase();

    const { amountInPkr, rate } = CurrencyService.convertToPkr(rawAmount, origCurrency);

    const type: TransactionType = ['income', 'expense', 'transfer', 'debt_given', 'debt_received'].includes(parsed.type)
      ? parsed.type
      : 'expense';

    return {
      type,
      amount: amountInPkr,
      originalAmount: origCurrency !== 'PKR' ? rawAmount : undefined,
      originalCurrency: origCurrency !== 'PKR' ? origCurrency : undefined,
      exchangeRate: origCurrency !== 'PKR' ? rate : undefined,
      currency: 'PKR',
      category: parsed.category || 'General',
      account: parsed.account || this.detectAccountFromText(rawText),
      personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
      note: parsed.note || rawText,
      tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
      confidence: Number(parsed.confidence) || 0.9
    };
  }

  private static heuristicParse(text: string): ParsedTransactionResult {
    const lower = text.toLowerCase();
    const currency = CurrencyService.detectCurrency(text);

    // Extract amount
    const amountMatch = text.match(/(?:rs\.?|pkr|usd|\$|€|£|aed|sar|amount)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    let rawAmount = 0;
    if (amountMatch) {
      rawAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    const { amountInPkr, rate } = CurrencyService.convertToPkr(rawAmount, currency);

    // Detect type
    let type: TransactionType = 'expense';
    if (lower.includes('recieved') || lower.includes('received') || lower.includes('got') || lower.includes('milay')) {
      type = 'income';
    } else if (lower.includes('sent') || lower.includes('transferred') || lower.includes('bheja') || lower.includes('transfer')) {
      type = 'transfer';
    }

    // Detect person
    let personName: string | undefined = undefined;
    const personMatch = text.match(/(?:to|from|for|by|ko)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (personMatch) {
      personName = personMatch[1];
    }

    return {
      type,
      amount: amountInPkr || 100,
      originalAmount: currency !== 'PKR' ? rawAmount : undefined,
      originalCurrency: currency !== 'PKR' ? currency : undefined,
      exchangeRate: currency !== 'PKR' ? rate : undefined,
      currency: 'PKR',
      category: lower.includes('food') || lower.includes('lunch') || lower.includes('dinner') ? 'Food & Dining' : 'General',
      account: this.detectAccountFromText(text),
      personName,
      note: text,
      confidence: 0.75
    };
  }

  static detectAccountFromText(text: string): string {
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
}
