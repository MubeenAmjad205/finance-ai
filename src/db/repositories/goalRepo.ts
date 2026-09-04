import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { SavingsGoal } from '../types';

export class GoalRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<SavingsGoal[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: SavingsGoal[] }>('find', 'goals', {
        sort: { targetAmount: -1 }
      });
      if (res?.documents && res.documents.length > 0) {
        return res.documents;
      }
    }
    return this.mockStore.goals;
  }

  async setGoal(title: string, targetAmount: number, currentAmount = 0): Promise<SavingsGoal> {
    const goal: SavingsGoal = {
      title,
      targetAmount,
      currentAmount,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    if (this.client.isConfigured) {
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

    const idx = this.mockStore.goals.findIndex(g => g.title.toLowerCase() === title.toLowerCase());
    if (idx !== -1) {
      this.mockStore.goals[idx] = { ...this.mockStore.goals[idx], targetAmount, currentAmount, updatedAt: goal.updatedAt };
      return this.mockStore.goals[idx];
    } else {
      const newGoal = { ...goal, _id: 'g_' + Date.now() };
      this.mockStore.goals.push(newGoal);
      return newGoal;
    }
  }

  async updateProgress(title: string, deltaAmount: number): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'goals', {
        filter: { title: { $regex: `^${title}$`, $options: 'i' } },
        update: {
          $inc: { currentAmount: deltaAmount },
          $set: { updatedAt: new Date().toISOString() }
        }
      });
      return;
    }

    const g = this.mockStore.goals.find(goal => goal.title.toLowerCase() === title.toLowerCase());
    if (g) {
      g.currentAmount += deltaAmount;
      g.updatedAt = new Date().toISOString();
    }
  }
}
