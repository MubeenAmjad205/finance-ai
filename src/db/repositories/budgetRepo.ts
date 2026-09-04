import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { BudgetCap } from '../types';

export class BudgetRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<BudgetCap[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: BudgetCap[] }>('find', 'budget_caps', {
        sort: { category: 1 }
      });
      if (res?.documents && res.documents.length > 0) {
        return res.documents;
      }
    }
    return this.mockStore.budgetCaps;
  }

  async setLimit(category: string, monthlyLimit: number, alertThresholdPct = 80): Promise<BudgetCap> {
    const updatedAt = new Date().toISOString();
    const capData: BudgetCap = {
      category,
      monthlyLimit,
      alertThresholdPct,
      updatedAt
    };

    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'budget_caps', {
        filter: { category: { $regex: `^${this.escapeRegex(category)}$`, $options: 'i' } },
        update: {
          $set: capData
        },
        upsert: true
      });
      return capData;
    }

    const idx = this.mockStore.budgetCaps.findIndex(
      b => b.category.toLowerCase() === category.toLowerCase()
    );
    if (idx !== -1) {
      this.mockStore.budgetCaps[idx] = { ...this.mockStore.budgetCaps[idx], ...capData };
      return this.mockStore.budgetCaps[idx];
    } else {
      const newCap = { ...capData, _id: 'b_' + Date.now() };
      this.mockStore.budgetCaps.push(newCap);
      return newCap;
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
