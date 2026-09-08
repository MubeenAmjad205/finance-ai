/**
 * Merchant & Utility Registry for Auto-Tagging & Classification
 * Automatically maps popular Pakistani & Global vendors to Categories and Default Account Types.
 */

export interface MerchantRule {
  name: string;
  matchPattern: RegExp;
  category: string;
  suggestedAccount?: string;
}

export const MERCHANT_REGISTRY: MerchantRule[] = [
  // Groceries & Supermarkets
  { name: 'Imtiaz Super Market', matchPattern: /\b(imtiaz|imtiaz super market)\b/i, category: 'Groceries' },
  { name: 'Naheed Superstore', matchPattern: /\b(naheed)\b/i, category: 'Groceries' },
  { name: 'Chase Up', matchPattern: /\b(chase up|chaseup)\b/i, category: 'Groceries' },
  { name: 'Carrefour', matchPattern: /\b(carrefour|hyperstar)\b/i, category: 'Groceries' },
  { name: 'Metro Cash & Carry', matchPattern: /\b(metro cash|metro)\b/i, category: 'Groceries' },
  { name: 'Local Dokan / Kiryana', matchPattern: /\b(dokan|kiryana|general store|store)\b/i, category: 'Groceries', suggestedAccount: 'Cash' },

  // Food & Dining
  { name: 'Foodpanda', matchPattern: /\b(foodpanda|panda)\b/i, category: 'Food & Dining', suggestedAccount: 'JazzCash' },
  { name: 'Cheezious', matchPattern: /\b(cheezious)\b/i, category: 'Food & Dining' },
  { name: 'Krave Mart', matchPattern: /\b(krave mart|kravemart)\b/i, category: 'Groceries' },
  { name: 'Tehzeeb Bakers', matchPattern: /\b(tehzeeb)\b/i, category: 'Food & Dining' },
  { name: 'Kolachi Restaurant', matchPattern: /\b(kolachi)\b/i, category: 'Food & Dining' },
  { name: 'Kababjees', matchPattern: /\b(kababjees|kababjeez)\b/i, category: 'Food & Dining' },
  { name: 'Savour Foods', matchPattern: /\b(savour|savor)\b/i, category: 'Food & Dining' },
  { name: 'OPTP', matchPattern: /\b(optp)\b/i, category: 'Food & Dining' },
  { name: 'McDonald\'s', matchPattern: /\b(mcdonald|mcdonalds|mcd)\b/i, category: 'Food & Dining' },
  { name: 'KFC', matchPattern: /\b(kfc)\b/i, category: 'Food & Dining' },
  { name: 'Domino\'s Pizza', matchPattern: /\b(domino|dominos)\b/i, category: 'Food & Dining' },

  // Transportation & Fuel
  { name: 'Careem', matchPattern: /\b(careem)\b/i, category: 'Transportation', suggestedAccount: 'JazzCash' },
  { name: 'InDrive', matchPattern: /\b(indrive|indriver)\b/i, category: 'Transportation', suggestedAccount: 'EasyPaisa' },
  { name: 'Yango', matchPattern: /\b(yango)\b/i, category: 'Transportation' },
  { name: 'Bykea', matchPattern: /\b(bykea)\b/i, category: 'Transportation', suggestedAccount: 'EasyPaisa' },
  { name: 'Shell Petrol', matchPattern: /\b(shell)\b/i, category: 'Transportation' },
  { name: 'Total Parco', matchPattern: /\b(total|total parco)\b/i, category: 'Transportation' },
  { name: 'PSO Fuel', matchPattern: /\b(pso|petrol|fuel|cng|diesel)\b/i, category: 'Transportation' },

  // Bills & Utilities
  { name: 'K-Electric', matchPattern: /\b(k-electric|kelectric|ke bill|k electric)\b/i, category: 'Bills & Utilities', suggestedAccount: 'Meezan Bank' },
  { name: 'SSGC Gas', matchPattern: /\b(ssgc|sui gas|gas bill)\b/i, category: 'Bills & Utilities' },
  { name: 'SNGPL Gas', matchPattern: /\b(sngpl)\b/i, category: 'Bills & Utilities' },
  { name: 'PTCL', matchPattern: /\b(ptcl|evdo)\b/i, category: 'Bills & Utilities' },
  { name: 'StormFiber', matchPattern: /\b(stormfiber|storm fiber)\b/i, category: 'Bills & Utilities' },
  { name: 'Nayatel', matchPattern: /\b(nayatel)\b/i, category: 'Bills & Utilities' },
  { name: 'LESCO Electricity', matchPattern: /\b(lesco|iesco|pesco|mepco|fesco|qesco)\b/i, category: 'Bills & Utilities' },

  // E-Commerce & Retail Shopping
  { name: 'Daraz', matchPattern: /\b(daraz|daraz\.pk)\b/i, category: 'Shopping', suggestedAccount: 'EasyPaisa' },
  { name: 'PriceOye', matchPattern: /\b(priceoye)\b/i, category: 'Shopping' },
  { name: 'Outfitters', matchPattern: /\b(outfitters)\b/i, category: 'Shopping' },
  { name: 'Khaadi', matchPattern: /\b(khaadi)\b/i, category: 'Shopping' },
  { name: 'Gul Ahmed', matchPattern: /\b(gul ahmed|gulahmed)\b/i, category: 'Shopping' },
  { name: 'J. Junaid Jamshed', matchPattern: /\b(j\.|junaid jamshed)\b/i, category: 'Shopping' },

  // Digital Subscriptions
  { name: 'Netflix', matchPattern: /\b(netflix)\b/i, category: 'Subscriptions', suggestedAccount: 'NayaPay' },
  { name: 'Spotify', matchPattern: /\b(spotify)\b/i, category: 'Subscriptions', suggestedAccount: 'SadaPay' },
  { name: 'Google One / iCloud', matchPattern: /\b(google one|icloud|apple storage)\b/i, category: 'Subscriptions' }
];

export class MerchantRegistry {
  /**
   * Detect vendor, category and default account from text
   */
  static detectMerchant(text: string): { merchantName: string; category: string; suggestedAccount?: string } | null {
    if (!text) return null;
    for (const rule of MERCHANT_REGISTRY) {
      if (rule.matchPattern.test(text)) {
        return {
          merchantName: rule.name,
          category: rule.category,
          suggestedAccount: rule.suggestedAccount
        };
      }
    }
    return null;
  }
}
