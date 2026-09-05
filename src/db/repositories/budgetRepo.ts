import { MongoDBAtlasClient } from '../client';
import { BudgetCap } from '../types';

export class BudgetRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<BudgetCap[]> {
    const res = await this.client.execute<{ documents: BudgetCap[] }>('find', 'budget_caps', {
      sort: { category: 1 }
    });
    return res?.documents || [];
  }

  async setLimit(category: string, monthlyLimit: number, alertThresholdPct = 80): Promise<BudgetCap> {
    const updatedAt = new Date().toISOString();
    const capData: BudgetCap = {
      category,
      monthlyLimit,
      alertThresholdPct,
      updatedAt
    };

    await this.client.execute('updateOne', 'budget_caps', {
      filter: { category: { $regex: `^${this.escapeRegex(category)}$`, $options: 'i' } },
      update: {
        $set: capData
      },
      upsert: true
    });

    return capData;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
