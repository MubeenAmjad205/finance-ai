import { MongoDBAtlasClient } from '../client';
import { Transaction } from '../types';

export class TransactionRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async create(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    const doc: Transaction = {
      ...tx,
      createdAt: new Date().toISOString()
    };

    const res = await this.client.execute<{ insertedId: string }>('insertOne', 'transactions', { document: doc });
    return res?.insertedId || doc._id || 'tx_' + Date.now();
  }

  async getById(id: string): Promise<Transaction | null> {
    const res = await this.client.execute<{ document: Transaction }>('findOne', 'transactions', {
      filter: { _id: id.length === 24 ? { $oid: id } : id }
    });
    return res?.document || null;
  }

  async update(id: string, update: Partial<Transaction>): Promise<boolean> {
    const res = await this.client.execute<{ matchedCount: number }>('updateOne', 'transactions', {
      filter: { _id: id.length === 24 ? { $oid: id } : id },
      update: { $set: update }
    });
    return (res?.matchedCount || 0) > 0;
  }

  async getLastConfirmed(): Promise<Transaction | null> {
    const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
      filter: { status: 'confirmed' },
      sort: { timestamp: -1 },
      limit: 1
    });
    return res?.documents?.[0] || null;
  }

  async getRecent(limit = 10): Promise<Transaction[]> {
    const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
      sort: { timestamp: -1 },
      limit
    });
    return res?.documents || [];
  }

  async getByMonth(monthIsoPrefix: string): Promise<Transaction[]> {
    const res = await this.client.execute<{ documents: Transaction[] }>('find', 'transactions', {
      filter: {
        timestamp: { $regex: `^${monthIsoPrefix}` }
      },
      sort: { timestamp: -1 }
    });
    return res?.documents || [];
  }

  async getMonthlyStats(monthIsoPrefix: string): Promise<{
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    categoryBreakdown: Record<string, number>;
  }> {
    const txs = await this.getByMonth(monthIsoPrefix);
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const tx of txs) {
      if (tx.status !== 'confirmed') continue;

      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
        categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
      }
    }

    return {
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
      categoryBreakdown
    };
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.client.execute<{ deletedCount: number }>('deleteOne', 'transactions', {
      filter: { _id: id.length === 24 ? { $oid: id } : id }
    });
    return (res?.deletedCount || 0) > 0;
  }
}
