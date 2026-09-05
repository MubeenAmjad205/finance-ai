import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { Transaction } from '../types';

export class TransactionRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async create(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    const doc: Transaction = {
      ...tx,
      createdAt: new Date().toISOString()
    };

    if (this.client.isConfigured) {
      const res = await this.client.execute<{ insertedId: string }>('insertOne', 'transactions', { document: doc });
      return res?.insertedId || 'tx_' + Date.now();
    }

    const mockId = 'mock_tx_' + Date.now();
    this.mockStore.transactions.unshift({ ...doc, _id: mockId });
    return mockId;
  }

  async getById(id: string): Promise<Transaction | null> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ document: Transaction }>('findOne', 'transactions', {
        filter: { _id: { $oid: id } }
      });
      return res?.document || null;
    }

    return this.mockStore.transactions.find(t => t._id === id) || null;
  }

  async update(id: string, update: Partial<Transaction>): Promise<boolean> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ matchedCount: number }>('updateOne', 'transactions', {
        filter: { _id: { $oid: id } },
        update: { $set: update }
      });
      return (res?.matchedCount || 0) > 0;
    }

    const idx = this.mockStore.transactions.findIndex(t => t._id === id);
    if (idx !== -1) {
      this.mockStore.transactions[idx] = { ...this.mockStore.transactions[idx], ...update };
      return true;
    }
    return false;
  }

  async getLastConfirmed(): Promise<Transaction | null> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
        filter: { status: 'confirmed' },
        sort: { timestamp: -1 },
        limit: 1
      });
      return res?.documents?.[0] || null;
    }

    return this.mockStore.transactions.find(t => t.status === 'confirmed') || null;
  }

  async getRecent(limit = 20): Promise<Transaction[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
        sort: { timestamp: -1 },
        limit
      });
      return res?.documents || [];
    }

    return this.mockStore.transactions.slice(0, limit);
  }

  async getByMonth(monthIsoPrefix: string): Promise<Transaction[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
        filter: { timestamp: { $regex: `^${monthIsoPrefix}` } },
        sort: { timestamp: -1 }
      });
      return res?.documents || [];
    }

    return this.mockStore.transactions.filter(t => t.timestamp.startsWith(monthIsoPrefix));
  }

  async getMonthlyStats(monthIsoPrefix: string): Promise<{ totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> }> {
    if (this.client.isConfigured) {
      const pipeline = [
        { $match: { status: 'confirmed', timestamp: { $regex: `^${monthIsoPrefix}` } } },
        { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } }
      ];
      const res = await this.client.execute<{ documents: any[] }>('aggregate', 'transactions', { pipeline });
      return this.parseAggStats(res?.documents || []);
    }

    // Calculate dynamically from mock store
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const tx of this.mockStore.transactions) {
      if (tx.status === 'confirmed' && tx.timestamp.startsWith(monthIsoPrefix)) {
        if (tx.type === 'income') {
          totalIncome += tx.amount;
        } else if (tx.type === 'expense') {
          totalExpense += tx.amount;
          categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
        }
      }
    }

    return { totalIncome, totalExpense, categoryBreakdown };
  }

  private parseAggStats(docs: any[]): { totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> } {
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const doc of docs) {
      const type = doc._id?.type;
      const cat = doc._id?.category || 'General';
      const sum = doc.total || 0;

      if (type === 'income') totalIncome += sum;
      if (type === 'expense') {
        totalExpense += sum;
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + sum;
      }
    }

    return { totalIncome, totalExpense, categoryBreakdown };
  }
}
