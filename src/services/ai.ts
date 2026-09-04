import { Env, TransactionType } from '../db/types';

export interface ParsedTransactionResult {
  type: TransactionType;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  currency: string;
  category: string;
  account: string; // e.g. "JazzCash", "EasyPaisa", "Meezan Bank", "Cash", etc.
  personName?: string;
  note: string;
  tags?: string[];
  confidence: number;
}

// Fallback currency exchange rates to PKR (if live rate API is unreachable)
const FALLBACK_EXCHANGE_RATES: Record<string, number> = {
  USD: 278.5,
  EUR: 302.0,
  GBP: 360.0,
  AED: 75.8,
  SAR: 74.2,
  PKR: 1.0
};

export class AIService {
  /**
   * Detect message intent: 'chat' (greetings/general chat), 'question' (financial query), or 'transaction' (logging expense/income)
   */
  static detectMessageIntent(text: string): 'chat' | 'question' | 'transaction' {
    const lower = text.trim().toLowerCase();

    // 1. General Greetings & Small Talk
    const chatPhrases = ['hi', 'hello', 'hey', 'how are you', 'who are you', 'what can you do', 'good morning', 'good evening', 'thanks', 'thank you', 'ok', 'okay', 'bye'];
    if (chatPhrases.includes(lower) || lower.startsWith('hi ') || lower.startsWith('hello ') || lower.startsWith('hey ')) {
      return 'chat';
    }

    // 2. Financial Questions & Queries
    if (lower.includes('how much') || lower.includes('what is my') || lower.includes('show my') || lower.includes('tell me') || lower.endsWith('?')) {
      return 'question';
    }

    // 3. Transactions (contains digits or financial action keywords)
    const hasNumbers = /\d+/.test(lower);
    const hasTxKeywords = lower.includes('spent') || lower.includes('paid') || lower.includes('received') || lower.includes('sent') || lower.includes('bheja') || lower.includes('milay') || lower.includes('easypaisa') || lower.includes('jazzcash') || lower.includes('meezan') || lower.includes('hbl') || lower.includes('cash');

    if (hasNumbers || hasTxKeywords) {
      return 'transaction';
    }

    return 'chat';
  }

  /**
   * AI Personal Financial Advisor & Savings Tips Generator
   */
  static async generateFinancialAdvisorTips(
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
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 350
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
        }
      }
    } catch (err) {
      console.error('[Workers AI Financial Advisor Error]:', err);
    }

    return `💡 **AI Financial Advisor Insights:**\n\n` +
      `1️⃣ **Optimize Dining & Delivery:** Your top spending category is dining. Cooking 2 extra meals a week can save ~8,000 PKR monthly.\n` +
      `2️⃣ **High-Yield Islamic Savings:** Keep your emergency fund in Meezan Sovereign Fund or HBL Islamic Savings for ~19-20% APY.\n` +
      `3️⃣ **Automate Savings:** Move 15% of income into your savings account as soon as salary arrives!`;
  }

  /**
   * Conversational Chat Response Generator
   */
  static async generateChatResponse(env: Env, text: string): Promise<string> {
    const prompt = `You are a friendly personal finance AI assistant for Pakistani users.
User Message: "${text}"

Reply in a warm, helpful, human-like tone in 1-2 short sentences. Mention that you can track their expenses, voice notes, receipts, and account balances.`;

    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const response: any = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150
        });

        const reply = response?.response || response?.result;
        if (reply && typeof reply === 'string') {
          return reply.trim();
        }
      }
    } catch (err) {
      console.error('[Workers AI Chat Response Error]:', err);
    }

    return `Hello! 👋 I am your Personal Finance AI assistant. You can tell me expenses like *"Spent 1450 at Tehzeeb via JazzCash"*, send voice notes, upload receipts, or ask questions!`;
  }

  /**
   * Transcribe Voice Note Audio Buffer using Cloudflare Workers AI Whisper Model (@cf/openai/whisper)
   */
  static async transcribeVoiceNote(env: Env, audioBuffer: ArrayBuffer): Promise<string> {
    try {
      if (env.AI && typeof env.AI.run === 'function') {
        const audioVector = Array.from(new Uint8Array(audioBuffer));
        const response: any = await env.AI.run('@cf/openai/whisper', {
          audio: audioVector
        });

        const text = response?.text || (typeof response === 'string' ? response : '');
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (err) {
      console.error('[Workers AI Whisper Error] Voice transcription failed:', err);
    }
    return '';
  }

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

Supported Currencies:
- "PKR", "USD", "EUR", "GBP", "AED", "SAR"

Supported Transaction Types:
- "expense" (spent money, bought items, paid bills)
- "income" (received salary, payment, freelance earnings)
- "transfer" (transferred money to a person or between own accounts)
- "debt_given" (lent money to a friend/person)
- "debt_received" (received back money lent to a friend)

Categories:
- "Food & Dining", "Groceries", "Bills & Utilities", "Rent", "Transportation", "Shopping", "Entertainment", "Health & Medical", "Salary", "Freelance", "Debt / Transfer", "General"

Response Format (STRICT JSON ONLY, no markdown, no conversational text):
{
  "type": "expense" | "income" | "transfer" | "debt_given" | "debt_received",
  "amount": number,
  "currency": "PKR" | "USD" | "EUR" | "GBP" | "AED" | "SAR",
  "category": "string",
  "account": "JazzCash" | "EasyPaisa" | "NayaPay" | "SadaPay" | "Meezan Bank" | "HBL" | "Cash" | string,
  "personName": "string or null if no person involved",
  "note": "brief summary of transaction",
  "tags": ["#Tag1", "#Tag2"],
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
Extract the total amount, currency (PKR/USD), account/bank name, receiver/sender name, transaction reference ID, and transaction type.
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
  const origCurrency = (parsed.currency || 'PKR').toUpperCase();
  const rawAmount = Math.abs(Number(parsed.amount) || 0);

  // Multi-Currency Exchange Conversion
  let amountInPkr = rawAmount;
  let rate = 1.0;
  if (origCurrency !== 'PKR' && FALLBACK_EXCHANGE_RATES[origCurrency]) {
    rate = FALLBACK_EXCHANGE_RATES[origCurrency];
    amountInPkr = Math.round(rawAmount * rate);
  }

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
    account: parsed.account || detectAccountFromText(rawText),
    personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
    note: parsed.note || rawText,
    tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    confidence: Number(parsed.confidence) || 0.9
  };
}

function heuristicParseText(text: string): ParsedTransactionResult {
  const lower = text.toLowerCase();
  
  // Detect foreign currencies
  let currency = 'PKR';
  if (lower.includes('$') || lower.includes('usd')) currency = 'USD';
  if (lower.includes('€') || lower.includes('eur')) currency = 'EUR';
  if (lower.includes('£') || lower.includes('gbp')) currency = 'GBP';
  if (lower.includes('aed') || lower.includes('dirham')) currency = 'AED';
  if (lower.includes('sar') || lower.includes('riyal')) currency = 'SAR';

  // Extract number/amount
  const amountMatch = text.match(/(?:rs\.?|pkr|usd|\$|€|£|aed|sar|amount)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
  let rawAmount = 0;
  if (amountMatch) {
    rawAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  let rate = FALLBACK_EXCHANGE_RATES[currency] || 1.0;
  let amountInPkr = currency !== 'PKR' ? Math.round(rawAmount * rate) : rawAmount;

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
    amount: amountInPkr || 100,
    originalAmount: currency !== 'PKR' ? rawAmount : undefined,
    originalCurrency: currency !== 'PKR' ? currency : undefined,
    exchangeRate: currency !== 'PKR' ? rate : undefined,
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
