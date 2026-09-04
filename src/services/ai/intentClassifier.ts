export type MessageIntent = 'chat' | 'question' | 'transaction';

export class IntentClassifier {
  /**
   * Detect message intent:
   * - 'chat': greetings, conversational remarks, small talk
   * - 'question': financial queries and questions about spending/balances
   * - 'transaction': logging an expense, income, transfer, or debt
   */
  static detect(text: string): MessageIntent {
    const lower = text.trim().toLowerCase();

    // 1. General Greetings & Small Talk
    const chatPhrases = [
      'hi', 'hello', 'hey', 'salam', 'assalam o alaikum', 'how are you',
      'who are you', 'what can you do', 'good morning', 'good evening',
      'thanks', 'thank you', 'shukriya', 'ok', 'okay', 'bye', 'help'
    ];
    if (
      chatPhrases.includes(lower) ||
      lower.startsWith('hi ') ||
      lower.startsWith('hello ') ||
      lower.startsWith('hey ') ||
      lower.startsWith('salam ')
    ) {
      return 'chat';
    }

    // 2. Financial Questions & Queries
    const isQuestionForm =
      lower.endsWith('?') ||
      lower.startsWith('how much') ||
      lower.startsWith('what is') ||
      lower.startsWith('what are') ||
      lower.startsWith('show me') ||
      lower.startsWith('tell me') ||
      lower.includes('kitna') ||
      lower.includes('kitne');

    // If it's phrased as a question and not a command
    if (isQuestionForm && !lower.startsWith('paid') && !lower.startsWith('spent')) {
      return 'question';
    }

    // 3. Transactions: Check for explicit financial verbs or monetary currency markers
    const hasNumbers = /\d+/.test(lower);
    const hasFinancialKeywords =
      lower.includes('spent') ||
      lower.includes('paid') ||
      lower.includes('received') ||
      lower.includes('sent') ||
      lower.includes('transfer') ||
      lower.includes('bheja') ||
      lower.includes('milay') ||
      lower.includes('kharch') ||
      lower.includes('easypaisa') ||
      lower.includes('jazzcash') ||
      lower.includes('nayapay') ||
      lower.includes('sadapay') ||
      lower.includes('meezan') ||
      lower.includes('hbl') ||
      lower.includes('ubl') ||
      lower.includes('alfalah') ||
      lower.includes('pkr') ||
      lower.includes('rs') ||
      lower.includes('rupees') ||
      lower.includes('$') ||
      lower.includes('usd') ||
      lower.includes('bought') ||
      lower.includes('khareeda');

    if (hasNumbers && hasFinancialKeywords) {
      return 'transaction';
    }

    // Secondary fallback: if it ends with ? treat as question
    if (lower.endsWith('?')) {
      return 'question';
    }

    return 'chat';
  }
}
