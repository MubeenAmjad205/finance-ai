import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { Account } from '../types';

export class AccountRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<Account[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Account[] }>('find', 'accounts', {
        sort: { name: 1 }
      });
      return res?.documents || [];
    }
    return [...this.mockStore.accounts].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(account: Account): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('insertOne', 'accounts', {
        document: account
      });
      return;
    }
    const exists = this.mockStore.accounts.some(a => a.name.toLowerCase() === account.name.toLowerCase());
    if (!exists) {
      this.mockStore.accounts.push(account);
    }
  }

  async setBalance(accountName: string, newBalance: number): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'accounts', {
        filter: { name: accountName },
        update: {
          $set: { balance: newBalance, updatedAt: new Date().toISOString() },
          $setOnInsert: { type: this.detectAccountType(accountName), currency: 'PKR' }
        },
        upsert: true
      });
      return;
    }

    const acc = this.mockStore.accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
    if (acc) {
      acc.balance = newBalance;
      acc.updatedAt = new Date().toISOString();
    } else {
      this.mockStore.accounts.push({
        _id: 'acc_' + Date.now(),
        name: accountName,
        type: this.detectAccountType(accountName),
        balance: newBalance,
        currency: 'PKR',
        updatedAt: new Date().toISOString()
      });
    }
  }

  async updateBalance(accountName: string, delta: number): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'accounts', {
        filter: { name: accountName },
        update: {
          $inc: { balance: delta },
          $setOnInsert: { type: this.detectAccountType(accountName), currency: 'PKR' },
          $set: { updatedAt: new Date().toISOString() }
        },
        upsert: true
      });
      return;
    }

    const acc = this.mockStore.accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
    if (acc) {
      acc.balance += delta;
      acc.updatedAt = new Date().toISOString();
    } else {
      this.mockStore.accounts.push({
        _id: 'acc_' + Date.now(),
        name: accountName,
        type: this.detectAccountType(accountName),
        balance: delta,
        currency: 'PKR',
        updatedAt: new Date().toISOString()
      });
    }
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
