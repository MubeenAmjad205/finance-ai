export interface PendingConversationSlot {
  chatId: number | string;
  partialText: string;
  missingSlot: 'amount' | 'details';
  timestamp: number;
}

export class ConversationStateManager {
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
  private static store = new Map<string, PendingConversationSlot>();

  /**
   * Check if user message is missing essential slots (amount or details)
   */
  static checkMissingSlots(text: string): { isPartial: boolean; missingSlot?: 'amount' | 'details' } {
    const trimmed = text.trim();
    const hasNumbers = /\d+/.test(trimmed);
    const lower = trimmed.toLowerCase();

    // Case 1: Just numbers or "spent 2500" without merchant/account/category
    const justAmountPattern = /^(?:spent|paid|kharch|diye|bheje)?\s*(?:rs\.?|pkr)?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:rs\.?|pkr|rupees)?$/i;
    if (justAmountPattern.test(trimmed)) {
      return { isPartial: true, missingSlot: 'details' };
    }

    // Case 2: Financial action without any amount (e.g. "bought groceries on jazzcash")
    const hasActionWithoutAmount =
      !hasNumbers &&
      (lower.startsWith('spent on ') ||
        lower.startsWith('paid for ') ||
        lower.startsWith('bought ') ||
        lower.includes('via jazzcash') ||
        lower.includes('via easypaisa'));

    if (hasActionWithoutAmount) {
      return { isPartial: true, missingSlot: 'amount' };
    }

    return { isPartial: false };
  }

  /**
   * Save pending slot for conversational follow-up
   */
  static savePendingSlot(chatId: number | string, partialText: string, missingSlot: 'amount' | 'details'): void {
    this.store.set(String(chatId), {
      chatId,
      partialText,
      missingSlot,
      timestamp: Date.now()
    });
  }

  /**
   * Try to resolve user's message against a previously pending conversation slot
   */
  static resolveFollowUp(chatId: number | string, followUpText: string): string | null {
    const key = String(chatId);
    const pending = this.store.get(key);

    if (!pending) return null;

    // Check TTL
    if (Date.now() - pending.timestamp > this.TTL_MS) {
      this.store.delete(key);
      return null;
    }

    this.store.delete(key);

    if (pending.missingSlot === 'details') {
      // E.g. pending was "Spent 2500", follow up is "Groceries JazzCash"
      return `${pending.partialText} on ${followUpText}`;
    } else if (pending.missingSlot === 'amount') {
      // E.g. pending was "Bought groceries on JazzCash", follow up is "1500"
      return `${pending.partialText} for ${followUpText}`;
    }

    return `${pending.partialText} ${followUpText}`;
  }

  /**
   * Detect natural text corrections or cancellations
   * E.g. "correction: it was 1500 not 2500", "actually via EasyPaisa", "galti se ho gaya cancel karo"
   */
  static detectCorrection(text: string): { isCorrection: boolean; isCancel?: boolean; newAmount?: number; newAccount?: string } {
    const lower = text.toLowerCase().trim();

    // Cancellation patterns
    if (/\b(cancel|undo|galti se|galati|mistake|ignore last|delete last|revert)\b/i.test(lower)) {
      return { isCorrection: true, isCancel: true };
    }

    // Correction patterns: "correction: ...", "actually ...", "it was ... not ..."
    const isCorrectionExplicit = /\b(correction|actually|it was|wrong amount|wrong account|instead of|change to)\b/i.test(lower);
    if (!isCorrectionExplicit) return { isCorrection: false };

    // Extract new amount if present
    const amountMatch = lower.match(/\b(\d+(?:,\d+)*(?:\.\d+)?)\b/);
    const newAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined;

    // Extract new account if present
    const accountMatch = lower.match(/\b(jazzcash|easypaisa|nayapay|sadapay|meezan|hbl|ubl|cash)\b/i);
    const newAccount = accountMatch ? accountMatch[1] : undefined;

    return {
      isCorrection: true,
      isCancel: false,
      newAmount: newAmount && !isNaN(newAmount) ? newAmount : undefined,
      newAccount
    };
  }

  /**
   * Clear pending slot
   */
  static clear(chatId: number | string): void {
    this.store.delete(String(chatId));
  }
}
