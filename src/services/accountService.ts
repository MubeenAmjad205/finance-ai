import { Account } from '../db/types';
import { MongoDBClient } from '../db/mongodb';

export interface FinancialInstitution {
  name: string;
  aliases: string[];
  type: 'bank' | 'mobile_wallet' | 'cash';
}

export class AccountService {
  /**
   * Comprehensive registry of Pakistani financial institutions (Banks, Digital Wallets, Fintechs)
   */
  private static readonly KNOWN_INSTITUTIONS: FinancialInstitution[] = [
    // Major Commercial & Islamic Banks
    { name: 'Meezan Bank', aliases: ['meezan', 'meezan bank', 'mbl'], type: 'bank' },
    { name: 'HBL', aliases: ['hbl', 'habib bank', 'habib bank limited'], type: 'bank' },
    { name: 'UBL', aliases: ['ubl', 'united bank', 'united bank limited'], type: 'bank' },
    { name: 'ABL', aliases: ['abl', 'allied bank', 'allied bank limited'], type: 'bank' },
    { name: 'MCB', aliases: ['mcb', 'mcb bank', 'muslim commercial bank'], type: 'bank' },
    { name: 'Bank Alfalah', aliases: ['alfalah', 'bank alfalah', 'bafl'], type: 'bank' },
    { name: 'Faysal Bank', aliases: ['faysal', 'faysal bank', 'fbl'], type: 'bank' },
    { name: 'Askari Bank', aliases: ['askari', 'askari bank', 'akbl'], type: 'bank' },
    { name: 'Bank of Punjab', aliases: ['bop', 'bank of punjab', 'punjab bank'], type: 'bank' },
    { name: 'Soneri Bank', aliases: ['soneri', 'soneri bank'], type: 'bank' },
    { name: 'Standard Chartered', aliases: ['standard chartered', 'scb', 'sc pack'], type: 'bank' },
    { name: 'JS Bank', aliases: ['js bank', 'js'], type: 'bank' },
    { name: 'Habib Metropolitan Bank', aliases: ['habib metro', 'habib metropolitan', 'hmbl'], type: 'bank' },
    { name: 'BankIslami', aliases: ['bankislami', 'bank islami'], type: 'bank' },
    { name: 'Al Baraka Bank', aliases: ['al baraka', 'albaraka'], type: 'bank' },
    { name: 'Dubai Islamic Bank', aliases: ['dib', 'dubai islamic', 'dubai islamic bank'], type: 'bank' },
    { name: 'Silkbank', aliases: ['silkbank', 'silk bank'], type: 'bank' },
    { name: 'Sindh Bank', aliases: ['sindh bank'], type: 'bank' },

    // Digital Wallets & EMIs / Fintechs
    { name: 'JazzCash', aliases: ['jazzcash', 'jazz cash', 'jc'], type: 'mobile_wallet' },
    { name: 'EasyPaisa', aliases: ['easypaisa', 'easy paisa', 'ep'], type: 'mobile_wallet' },
    { name: 'SadaPay', aliases: ['sadapay', 'sada pay', 'sp'], type: 'mobile_wallet' },
    { name: 'NayaPay', aliases: ['nayapay', 'naya pay', 'np'], type: 'mobile_wallet' },
    { name: 'Raast', aliases: ['raast', 'rast'], type: 'mobile_wallet' },
    { name: 'Zindigi', aliases: ['zindigi', 'zindagi'], type: 'mobile_wallet' },
    { name: 'Upaisa', aliases: ['upaisa', 'u paisa'], type: 'mobile_wallet' },
    { name: 'Keenu', aliases: ['keenu', 'keenu wallet'], type: 'mobile_wallet' },
    { name: 'Finja', aliases: ['finja'], type: 'mobile_wallet' },

    // Cash
    { name: 'Cash', aliases: ['cash', 'naqad', 'pocket', 'petty cash', 'haath mein'], type: 'cash' }
  ];

  /**
   * Detect financial institution from unstructured text or OCR receipt lines
   */
  static detectAccount(text: string): { name: string; type: 'bank' | 'mobile_wallet' | 'cash' } | null {
    if (!text) return null;
    const lower = text.toLowerCase();

    for (const inst of this.KNOWN_INSTITUTIONS) {
      for (const alias of inst.aliases) {
        // Word boundary match to prevent false partial substring matches
        const pattern = new RegExp(`(^|[^a-z0-9])${alias.replace(/\s+/g, '\\s+')}([^a-z0-9]|$)`, 'i');
        if (pattern.test(lower)) {
          return { name: inst.name, type: inst.type };
        }
      }
    }

    return null;
  }

  /**
   * Dynamically resolves or registers an account into MongoDB.
   * If the account doesn't exist yet, it auto-registers it dynamically.
   */
  static async resolveOrRegisterAccount(
    db: MongoDBClient,
    rawName: string,
    defaultType?: 'bank' | 'mobile_wallet' | 'cash'
  ): Promise<Account> {
    const trimmed = rawName.trim();
    if (!trimmed) {
      // Return cash as neutral default if completely empty
      return {
        name: 'Cash',
        type: 'cash',
        balance: 0,
        currency: 'PKR',
        updatedAt: new Date().toISOString()
      };
    }

    const detected = this.detectAccount(trimmed);
    const standardName = detected ? detected.name : trimmed;
    const standardType = detected ? detected.type : defaultType || 'bank';

    const existingAccounts = await db.getAllAccounts();
    const match = existingAccounts.find(
      a => a.name.toLowerCase() === standardName.toLowerCase()
    );

    if (match) {
      return match;
    }

    // Auto-register new account dynamically into MongoDB
    const newAcc: Account = {
      name: standardName,
      type: standardType,
      balance: 0,
      currency: 'PKR',
      updatedAt: new Date().toISOString()
    };

    if (db.accounts?.create) {
      await db.accounts.create(newAcc);
    } else {
      await db.setAccountBalance(standardName, 0);
    }

    return newAcc;
  }

  /**
   * Returns emoji icon for any institution name dynamically
   */
  static getAccountEmoji(accountName: string): string {
    const lower = (accountName || '').toLowerCase();
    if (lower.includes('cash') || lower.includes('naqad')) return '💵';
    if (lower.includes('jazzcash') || lower.includes('easypaisa') || lower.includes('sadapay') || lower.includes('nayapay') || lower.includes('zindigi') || lower.includes('wallet')) return '📱';
    return '🏦';
  }
}
