import { Env, TransactionType } from '../../db/types';
import { CurrencyService } from './currencyService';
import { PromptGuard } from './promptGuard';
import { PiiFilter } from '../piiFilter';
import { TemporalResolver } from '../temporalResolver';
import { AccountService } from '../accountService';

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
  isHighValue?: boolean;
}

export const HIGH_VALUE_THRESHOLD_PKR = 50000;

export class TransactionTextParser {
  static async parse(env: Env, text: string): Promise<ParsedTransactionResult> {
    const { sanitizedText } = PromptGuard.sanitize(text);
    const temporal = TemporalResolver.getCurrentContext();

    const systemPrompt = `You are an expert financial assistant for Pakistani personal expense tracking.
Convert unstructured financial messages (English, Urdu, Roman Urdu) into structured JSON.

${temporal.promptContext}

Supported Accounts:
- "JazzCash", "EasyPaisa", "NayaPay", "SadaPay", "Meezan Bank", "HBL", "UBL", "Bank Alfalah", "Cash", "Default"

Supported Currencies:
- "PKR", "USD", "EUR", "GBP", "AED", "SAR"

CRITICAL TRANSACTION TYPE RULES:
- "set_balance": User is setting, adding, opening, or initializing an account or starting balance (e.g. "Add my new UBL account with initial balance of 1000", "Set UBL balance 5000", "Update EasyPaisa balance to 2000", "Open Meezan account with 50000").
- "income": Money coming IN to the user (e.g. "receive", "received", "credited", "got", "salary", "deposit", "deposited", "earned", "client paid", "refund", "cashback", "mila", "aaya"). Example: "Today I receive 1000 in my UBL bank account" -> type MUST be "income"!
- "expense": Money going OUT or spent (e.g. "spent", "paid", "bought", "kharcha", "diye", "bill", "purchased", "recharge").
- "transfer": Moving money between user's own accounts (e.g. "transferred 5000 from Meezan to JazzCash").
- "debt_given": Lending money to someone else (e.g. "gave 2000 loan to Ali").
- "debt_received": Receiving borrowed money back from someone (e.g. "Ali returned 2000").

Categories:
- "Food & Dining", "Groceries", "Bills & Utilities", "Rent", "Transportation", "Shopping", "Entertainment", "Health & Medical", "Salary", "Freelance", "Debt / Transfer", "General"

Response Format (STRICT JSON ONLY, no markdown, no conversational text):
{
  "type": "expense" | "income" | "transfer" | "debt_given" | "debt_received" | "set_balance",
  "amount": number,
  "currency": "PKR" | "USD" | "EUR" | "GBP" | "AED" | "SAR",
  "category": "string",
  "account": "JazzCash" | "EasyPaisa" | "NayaPay" | "SadaPay" | "Meezan Bank" | "HBL" | "UBL" | "Cash" | string,
  "personName": "string or null",
  "note": "brief summary",
  "tags": ["#Tag1"],
  "confidence": 0.95
}`;

    const userPrompt = `User message: "${sanitizedText}"\nExtract details into JSON:`;

    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-3b-instruct', {
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
          return this.sanitizeParsedResult(parsed, sanitizedText);
        }
      }
    } catch (err) {
      console.error('[TransactionTextParser Error]:', err);
    }

    return this.heuristicParse(sanitizedText);
  }

  /**
   * Parse single or compound multi-expense messages
   * E.g. "Spent 500 on lunch and 300 on rickshaw" -> 2 separate transactions
   */
  static async parseCompoundExpenses(env: Env, text: string): Promise<ParsedTransactionResult[]> {
    const clauses = text.split(/\s+(?:and|aur|\+)\s+|\n+/i).map(c => c.trim()).filter(c => c.length > 0);
    
    // Check if multiple clauses each contain an amount
    const financialClauses = clauses.filter(c => /\d+/.test(c));
    if (financialClauses.length > 1) {
      const results: ParsedTransactionResult[] = [];
      for (const clause of financialClauses) {
        const hasAccount = /jazzcash|easypaisa|nayapay|sadapay|meezan|hbl|cash/i.test(clause);
        const effectiveClause = hasAccount ? clause : `${clause} via ${this.detectAccountFromText(text)}`;
        const parsed = await this.parse(env, effectiveClause);
        results.push(parsed);
      }
      return results;
    }

    const single = await this.parse(env, text);
    return [single];
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
    const lowerRaw = rawText.toLowerCase();

    const { amountInPkr, rate } = CurrencyService.convertToPkr(rawAmount, origCurrency);

    let type: TransactionType = ['income', 'expense', 'transfer', 'debt_given', 'debt_received', 'set_balance'].includes(parsed.type)
      ? parsed.type
      : 'expense';

    const isSetBalanceExplicit = /\b(initial balance|starting balance|opening balance|set balance|account with .* balance|add (?:my|may|new)? .* account|account.* balance of)\b/i.test(lowerRaw);
    if (isSetBalanceExplicit) {
      type = 'set_balance';
    } else {
      // Heuristic correction: If user clearly stated receiving funds (income), override false expense classification
      const isIncomeExplicit = /\b(receive|received|recieved|receives|receiving|credited|deposit|deposited|salary|freelance|earned|earning|inflow|cashback|refund|reversal|mila|milay|aaye|aaya|kamai)\b/i.test(lowerRaw);
      const isSpendingExplicit = /\b(spent|paid|buy|bought|purchase|cost|kharcha|diye|bill|fee|petrol|dinner|lunch|food)\b/i.test(lowerRaw);

      if (isIncomeExplicit && !isSpendingExplicit) {
        type = 'income';
      } else if (isSpendingExplicit && !isIncomeExplicit) {
        type = 'expense';
      }
    }

    const sanitizedNote = PiiFilter.redact(parsed.note || rawText).redactedText;
    const isHighValue = amountInPkr >= HIGH_VALUE_THRESHOLD_PKR;

    return {
      type,
      amount: amountInPkr,
      originalAmount: origCurrency !== 'PKR' ? rawAmount : undefined,
      originalCurrency: origCurrency !== 'PKR' ? origCurrency : undefined,
      exchangeRate: origCurrency !== 'PKR' ? rate : undefined,
      currency: 'PKR',
      category: parsed.category || (type === 'income' ? 'Salary' : 'General'),
      account: parsed.account || this.detectAccountFromText(rawText),
      personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
      note: sanitizedNote,
      tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
      confidence: Number(parsed.confidence) || 0.9,
      isHighValue
    };
  }

  private static heuristicParse(text: string): ParsedTransactionResult {
    const lower = text.toLowerCase();
    const currency = CurrencyService.detectCurrency(text);

    // Strip Pakistani phone numbers before extracting transaction amount
    const textWithoutPhone = text.replace(/(?:\+92|0092|92|0)?3\d{2}[-\s]?\d{7}\b/g, '');

    // Extract amount
    const amountMatch = textWithoutPhone.match(/(?:rs\.?|pkr|usd|\$|€|£|aed|sar|amount)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    let rawAmount = 0;
    if (amountMatch) {
      const candidate = parseFloat(amountMatch[1].replace(/,/g, ''));
      const digitsOnly = amountMatch[1].replace(/\D/g, '');
      if (!(digitsOnly.length >= 10 && (digitsOnly.startsWith('03') || digitsOnly.startsWith('923')))) {
        rawAmount = candidate;
      }
    }

    const { amountInPkr, rate } = CurrencyService.convertToPkr(rawAmount, currency);

    // Detect type
    let type: TransactionType = 'expense';
    const isSetBalanceExplicit = /\b(initial balance|starting balance|opening balance|set balance|account with .* balance|add (?:my|may|new)? .* account|account.* balance of)\b/i.test(lower);
    if (isSetBalanceExplicit) {
      type = 'set_balance';
    } else {
      const isIncomeExplicit = /\b(receive|received|recieved|receives|receiving|credited|deposit|deposited|salary|freelance|earned|earning|inflow|cashback|refund|reversal|mila|milay|aaye|aaya|kamai|got)\b/i.test(lower);
      const isTransferExplicit = /\b(sent|transferred|transfer|bheja|bheje)\b/i.test(lower);

      if (isIncomeExplicit) {
        type = 'income';
      } else if (isTransferExplicit) {
        type = 'transfer';
      }
    }

    // Detect person
    let personName: string | undefined = undefined;
    const personMatch = text.match(/(?:to|from|for|by|ko)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (personMatch) {
      personName = personMatch[1];
    }

    const sanitizedNote = PiiFilter.redact(text).redactedText;
    const finalAmount = amountInPkr || 100;
    const isHighValue = finalAmount >= HIGH_VALUE_THRESHOLD_PKR;

    return {
      type,
      amount: finalAmount,
      originalAmount: currency !== 'PKR' ? rawAmount : undefined,
      originalCurrency: currency !== 'PKR' ? currency : undefined,
      exchangeRate: currency !== 'PKR' ? rate : undefined,
      currency: 'PKR',
      category: lower.includes('food') || lower.includes('lunch') || lower.includes('dinner') ? 'Food & Dining' : 'General',
      account: this.detectAccountFromText(text),
      personName,
      note: sanitizedNote,
      confidence: 0.75,
      isHighValue
    };
  }

  static detectAccountFromText(text: string, defaultAccount?: string): string {
    const detected = AccountService.detectAccount(text);
    if (detected) return detected.name;
    return defaultAccount || 'Cash';
  }
}
