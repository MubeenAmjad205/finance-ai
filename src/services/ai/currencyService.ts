// Exchange rates to PKR (with realistic default fallbacks)
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 278.5,
  EUR: 302.0,
  GBP: 360.0,
  AED: 75.8,
  SAR: 74.2,
  PKR: 1.0
};

export class CurrencyService {
  private static cachedRates: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };
  private static lastFetchTime = 0;
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

  /**
   * Refresh rates in the background from a free open exchange API
   */
  static async refreshLiveRates(): Promise<Record<string, number>> {
    const now = Date.now();
    if (now - this.lastFetchTime < this.CACHE_TTL_MS && Object.keys(this.cachedRates).length > 1) {
      return this.cachedRates;
    }

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data: any = await res.json();
        const usdToPkr = data?.rates?.PKR;
        if (typeof usdToPkr === 'number' && usdToPkr > 100) {
          const newRates: Record<string, number> = {
            USD: Math.round(usdToPkr * 10) / 10,
            PKR: 1.0
          };

          const foreignCurrencies = ['EUR', 'GBP', 'AED', 'SAR'];
          for (const curr of foreignCurrencies) {
            const usdToCurr = data?.rates?.[curr];
            if (typeof usdToCurr === 'number' && usdToCurr > 0) {
              newRates[curr] = Math.round((usdToPkr / usdToCurr) * 10) / 10;
            } else {
              newRates[curr] = DEFAULT_EXCHANGE_RATES[curr];
            }
          }

          this.cachedRates = newRates;
          this.lastFetchTime = now;
        }
      }
    } catch (err) {
      // Non-blocking: fallback to defaults silently
    }

    return this.cachedRates;
  }

  /**
   * Convert an amount in a given currency to PKR
   */
  static convertToPkr(amount: number, currency: string, customRates?: Record<string, number>): {
    amountInPkr: number;
    rate: number;
    currency: string;
  } {
    const curr = (currency || 'PKR').toUpperCase();
    const rates = customRates || this.cachedRates || DEFAULT_EXCHANGE_RATES;
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
