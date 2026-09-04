// Exchange rates to PKR (with reasonable fallbacks)
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 278.5,
  EUR: 302.0,
  GBP: 360.0,
  AED: 75.8,
  SAR: 74.2,
  PKR: 1.0
};

export class CurrencyService {
  /**
   * Convert an amount in a given currency to PKR
   */
  static convertToPkr(amount: number, currency: string, customRates?: Record<string, number>): {
    amountInPkr: number;
    rate: number;
    currency: string;
  } {
    const curr = (currency || 'PKR').toUpperCase();
    const rates = customRates || DEFAULT_EXCHANGE_RATES;
    const rate = rates[curr] || 1.0;
    const amountInPkr = curr !== 'PKR' ? Math.round(amount * rate) : amount;

    return {
      amountInPkr,
      rate,
      currency: curr
    };
  }

  /**
   * Detect currency symbol or code from text
   */
  static detectCurrency(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('$') || lower.includes('usd') || lower.includes('dollar')) return 'USD';
    if (lower.includes('€') || lower.includes('eur') || lower.includes('euro')) return 'EUR';
    if (lower.includes('£') || lower.includes('gbp') || lower.includes('pound')) return 'GBP';
    if (lower.includes('aed') || lower.includes('dirham')) return 'AED';
    if (lower.includes('sar') || lower.includes('riyal')) return 'SAR';
    return 'PKR';
  }
}
