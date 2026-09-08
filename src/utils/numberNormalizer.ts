/**
 * Number & Vernacular Normalizer for Pakistani & Global Financial Contexts
 * Handles slang suffixes like 'k', 'hazar', 'lakh', 'lac', 'million' and Roman Urdu financial terms.
 */

export class NumberNormalizer {
  /**
   * Parse amounts containing vernacular multipliers like "1.5 hazar", "2.5 lakh", "10k", "1 lac"
   */
  static parseVernacularAmount(text: string): number | null {
    if (!text || typeof text !== 'string') return null;

    const lower = text.toLowerCase().trim();

    // 1. Million (e.g. 1.5 million, 2m)
    const millionMatch = lower.match(/(\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:m|million|millions)\b)/i);
    if (millionMatch) {
      const numMatch = millionMatch[1].match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1].replace(/,/g, ''));
        if (!isNaN(val)) return val * 1_000_000;
      }
    }

    // 2. Lakh / Lac (e.g. 2.5 lakh, 1 lac, 5 lakhs)
    const lakhMatch = lower.match(/(\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:lakh|lakhs|lac|lacs)\b)/i);
    if (lakhMatch) {
      const numMatch = lakhMatch[1].match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1].replace(/,/g, ''));
        if (!isNaN(val)) return val * 100_000;
      }
    }

    // 3. Thousand / Hazar / K (e.g. 1.5 hazar, 25k, 5 hazar, 10k)
    const thousandMatch = lower.match(/(\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:k|hazar|hazaar|hazhar|hazarr|thou|thousand|thousands)\b)/i);
    if (thousandMatch) {
      const numMatch = thousandMatch[1].match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1].replace(/,/g, ''));
        if (!isNaN(val)) return val * 1_000;
      }
    }

    // 4. Plain Numeric Amount (e.g. 1500, 25000, 850.50)
    const plainMatch = lower.match(/(?:rs\.?|pkr|usd|\$|€|£|aed|sar|amount)?\s*(\b\d+(?:,\d+)*(?:\.\d+)?\b)/i);
    if (plainMatch) {
      const candidate = parseFloat(plainMatch[1].replace(/,/g, ''));
      if (!isNaN(candidate)) return candidate;
    }

    return null;
  }

  /**
   * Pre-process raw user text to replace vernacular amount expressions with standard numbers
   * E.g. "Spent 1.5 hazar on groceries" -> "Spent 1500 on groceries"
   * E.g. "Got 2.5 lakh salary" -> "Got 250000 salary"
   */
  static normalizeTextAmounts(text: string): string {
    if (!text) return text;
    let normalized = text;

    // Lakh / Lac
    normalized = normalized.replace(/(\b\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b/gi, (_, num) => {
      const val = parseFloat(num) * 100_000;
      return String(val);
    });

    // Hazar / K
    normalized = normalized.replace(/(\b\d+(?:\.\d+)?)\s*(?:k|hazar|hazaar|hazhar|hazarr|thou|thousand|thousands)\b/gi, (_, num) => {
      const val = parseFloat(num) * 1_000;
      return String(val);
    });

    // Million
    normalized = normalized.replace(/(\b\d+(?:\.\d+)?)\s*(?:m|million|millions)\b/gi, (_, num) => {
      const val = parseFloat(num) * 1_000_000;
      return String(val);
    });

    return normalized;
  }
}
