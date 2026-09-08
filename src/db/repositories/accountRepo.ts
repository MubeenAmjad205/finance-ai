import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { Account } from '../types';

export class AccountRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  async getAll(): Promise<Account[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM accounts ORDER BY name ASC');
      return rows.map(r => ({
        _id: r.id,
        name: r.name,
        balance: Number(r.balance) || 0,
        currency: r.currency || 'PKR',
        type: r.type || 'mobile_wallet',
        updatedAt: r.updatedAt || new Date().toISOString()
      }));
    }
    return this.mockStore.getAllAccounts();
  }

  async create(account: Account): Promise<void> {
    if (this.neon.isConfigured) {
      const id = account._id || `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await this.neon.query(
        `INSERT INTO accounts (id, name, balance, currency, type, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET balance = EXCLUDED.balance, "updatedAt" = EXCLUDED."updatedAt"`,
        [id, account.name, account.balance, account.currency || 'PKR', account.type || this.detectAccountType(account.name), new Date().toISOString()]
      );
      return;
    }
    await this.mockStore.setAccountBalance(account.name, account.balance);
  }

  async setBalance(accountName: string, newBalance: number): Promise<boolean> {
    if (this.neon.isConfigured) {
      const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const type = this.detectAccountType(accountName);
      await this.neon.query(
        `INSERT INTO accounts (id, name, balance, currency, type, "updatedAt")
         VALUES ($1, $2, $3, 'PKR', $4, $5)
         ON CONFLICT (name) DO UPDATE SET balance = $3, "updatedAt" = $5`,
        [id, accountName, newBalance, type, now]
      );
      return !this.neon.lastError;
    }
    return this.mockStore.setAccountBalance(accountName, newBalance);
  }

  async updateBalance(accountName: string, delta: number): Promise<boolean> {
    if (this.neon.isConfigured) {
      const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const type = this.detectAccountType(accountName);
      await this.neon.query(
        `INSERT INTO accounts (id, name, balance, currency, type, "updatedAt")
         VALUES ($1, $2, $3, 'PKR', $4, $5)
         ON CONFLICT (name) DO UPDATE SET balance = accounts.balance + $3, "updatedAt" = $5`,
        [id, accountName, delta, type, now]
      );
      return !this.neon.lastError;
    }
    return this.mockStore.updateAccountBalance(accountName, delta);
  }

  detectAccountType(name: string): 'mobile_wallet' | 'bank' | 'cash' | 'card' {
    const n = name.toLowerCase();
    if (n.includes('jazzcash') || n.includes('easypaisa') || n.includes('nayapay') || n.includes('sadapay')) {
      return 'mobile_wallet';
    }
    if (n.includes('bank') || n.includes('meezan') || n.includes('hbl') || n.includes('ubl') || n.includes('alfalah')) {
      return 'bank';
    }
    if (n.includes('cash')) return 'cash';
    return 'card';
  }
}
