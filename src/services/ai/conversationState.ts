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
   * Clear pending slot
   */
  static clear(chatId: number | string): void {
    this.store.delete(String(chatId));
  }
}
