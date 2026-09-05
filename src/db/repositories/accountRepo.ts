import { MongoDBAtlasClient } from '../client';
import { Account } from '../types';

export class AccountRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<Account[]> {
    const res = await this.client.execute<{ documents: Account[] }>('find', 'accounts', {
      sort: { name: 1 }
    });
    return res?.documents || [];
  }

  async create(account: Account): Promise<void> {
    await this.client.execute('insertOne', 'accounts', {
      document: account
    });
  }

  async setBalance(accountName: string, newBalance: number): Promise<boolean> {
    const res = await this.client.execute<{ matchedCount?: number; modifiedCount?: number; upsertedId?: string }>('updateOne', 'accounts', {
      filter: { name: accountName },
      update: {
        $set: { balance: newBalance, updatedAt: new Date().toISOString() },
        $setOnInsert: { type: this.detectAccountType(accountName), currency: 'PKR' }
      },
      upsert: true
    });
    return Boolean(res && (res.matchedCount !== undefined || res.modifiedCount !== undefined || res.upsertedId !== undefined));
  }

  async updateBalance(accountName: string, delta: number): Promise<boolean> {
    const res = await this.client.execute<{ matchedCount?: number; modifiedCount?: number; upsertedId?: string }>('updateOne', 'accounts', {
      filter: { name: accountName },
      update: {
        $inc: { balance: delta },
        $setOnInsert: { type: this.detectAccountType(accountName), currency: 'PKR' },
        $set: { updatedAt: new Date().toISOString() }
      },
      upsert: true
    });
    return Boolean(res && (res.matchedCount !== undefined || res.modifiedCount !== undefined || res.upsertedId !== undefined));
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
