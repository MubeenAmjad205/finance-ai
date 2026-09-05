import { MongoDBAtlasClient } from '../client';
import { SavingsGoal } from '../types';

export class GoalRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<SavingsGoal[]> {
    const res = await this.client.execute<{ documents: SavingsGoal[] }>('find', 'goals', {
      sort: { targetAmount: -1 }
    });
    return res?.documents || [];
  }

  async setGoal(title: string, targetAmount: number, currentAmount = 0): Promise<SavingsGoal> {
    const goal: SavingsGoal = {
      title,
      targetAmount,
      currentAmount,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await this.client.execute('updateOne', 'goals', {
      filter: { title: { $regex: `^${title}$`, $options: 'i' } },
      update: {
        $set: { targetAmount, currentAmount, updatedAt: goal.updatedAt },
        $setOnInsert: { createdAt: goal.createdAt }
      },
      upsert: true
    });
    return goal;
  }

  async updateProgress(title: string, deltaAmount: number): Promise<void> {
    await this.client.execute('updateOne', 'goals', {
      filter: { title: { $regex: `^${title}$`, $options: 'i' } },
      update: {
        $inc: { currentAmount: deltaAmount },
        $set: { updatedAt: new Date().toISOString() }
      }
    });
  }
}
