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

    // 1. General Greetings & Small Talk (English & Urdu/Roman Urdu)
    const chatPhrases = [
      'hi', 'hello', 'hey', 'salam', 'assalam o alaikum', 'assalamualaikum', 'aoa',
      'how are you', 'kaise ho', 'kia haal hai', 'kya haal hai', 'kese ho',
      'who are you', 'what can you do', 'good morning', 'good evening',
      'thanks', 'thank you', 'shukriya', 'meherbani', 'ok', 'okay', 'theek hai', 'bye', 'help'
    ];
    if (
      chatPhrases.includes(lower) ||
      lower.startsWith('hi ') ||
      lower.startsWith('hello ') ||
      lower.startsWith('hey ') ||
      lower.startsWith('salam') ||
      lower.startsWith('kya haal') ||
      lower.startsWith('kia haal')
    ) {
      return 'chat';
    }

    // 2. Financial Questions & Queries (English & Roman Urdu)
    const isQuestionForm =
      lower.endsWith('?') ||
      lower.startsWith('how much') ||
      lower.startsWith('what is') ||
      lower.startsWith('what are') ||
      lower.startsWith('show me') ||
      lower.startsWith('tell me') ||
      lower.includes('kitna') ||
      lower.includes('kitne') ||
      lower.includes('hisab') ||
      lower.includes('hisaab') ||
      lower.includes('kahan kharch') ||
      lower.includes('kia bacha') ||
      lower.includes('kya bacha') ||
      lower.includes('batao') ||
      lower.includes('dikhao');

    // If it's phrased as a question and not a command
    if (isQuestionForm && !lower.startsWith('paid') && !lower.startsWith('spent') && !lower.startsWith('diye')) {
      return 'question';
    }

    // 3. Transactions: Check for explicit financial verbs, payment channels or monetary markers
    const hasNumbers = /\d+/.test(lower);
    const hasFinancialKeywords =
      lower.includes('spent') ||
      lower.includes('paid') ||
      lower.includes('received') ||
      lower.includes('sent') ||
      lower.includes('transfer') ||
      lower.includes('bheja') ||
      lower.includes('bheje') ||
      lower.includes('milay') ||
      lower.includes('mile') ||
      lower.includes('kharch') ||
      lower.includes('kharcha') ||
      lower.includes('diye') ||
      lower.includes('diya') ||
      lower.includes('liya') ||
      lower.includes('mangwaya') ||
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
      lower.includes('khareeda') ||
      lower.includes('kameti') ||
      lower.includes('committee') ||
      lower.includes('udhaar') ||
      lower.includes('qarz') ||
      lower.includes('tankhwah') ||
      lower.includes('salary') ||
      lower.includes('petrol') ||
      lower.includes('rickshaw') ||
      lower.includes('bykea') ||
      lower.includes('careem') ||
      lower.includes('indrive') ||
      lower.includes('doodh') ||
      lower.includes('sabzi') ||
      lower.includes('bill');

    if (hasNumbers && hasFinancialKeywords) {
      return 'transaction';
    }

    // Secondary fallback: if it ends with ? treat as question
    if (lower.endsWith('?')) {
      return 'question';
    }

    return 'chat';
  }

  /**
   * Detect whether text is primarily Roman Urdu / Urdu or English
   */
  static detectLanguage(text: string): 'roman_urdu' | 'english' {
    const lower = text.toLowerCase();
    const romanUrduMarkers = [
      'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'par', 'mein', 'aur', 'bhai', 'yaar',
      'diya', 'diye', 'mila', 'milay', 'bheja', 'kharch', 'kharcha', 'kitna', 'kitne',
      'kahan', 'shukriya', 'salam', 'karo', 'karein', 'udhaar', 'tankhwah', 'chaye', 'chai'
    ];

    let count = 0;
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (romanUrduMarkers.includes(w)) count++;
    }

    return count >= 1 ? 'roman_urdu' : 'english';
  }
}
