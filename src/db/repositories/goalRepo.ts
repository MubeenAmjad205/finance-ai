import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { SavingsGoal } from '../types';

export class GoalRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  async getAll(): Promise<SavingsGoal[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM goals ORDER BY "targetAmount" DESC');
      return rows.map(r => ({
        _id: r.id,
        title: r.title,
        targetAmount: Number(r.targetAmount) || 0,
        currentAmount: Number(r.currentAmount) || 0,
        updatedAt: r.updatedAt || new Date().toISOString(),
        createdAt: r.createdAt || new Date().toISOString()
      }));
    }
    return this.mockStore.getGoals();
  }

  async setGoal(title: string, targetAmount: number, currentAmount = 0): Promise<SavingsGoal> {
    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const goal: SavingsGoal = {
      _id: id,
      title,
      targetAmount,
      currentAmount,
      updatedAt: now,
      createdAt: now
    };

    if (this.neon.isConfigured) {
      await this.neon.query(
        `INSERT INTO goals (id, title, "targetAmount", "currentAmount", "updatedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (title) DO UPDATE SET "targetAmount" = EXCLUDED."targetAmount", "currentAmount" = EXCLUDED."currentAmount", "updatedAt" = EXCLUDED."updatedAt"`,
        [id, title, targetAmount, currentAmount, now]
      );
      return goal;
    }
    return this.mockStore.setGoal(title, targetAmount, currentAmount);
  }

  async updateProgress(title: string, deltaAmount: number): Promise<void> {
    if (this.neon.isConfigured) {
      const now = new Date().toISOString();
      await this.neon.query(
        `UPDATE goals SET "currentAmount" = "currentAmount" + $1, "updatedAt" = $2 WHERE LOWER(title) = LOWER($3)`,
        [deltaAmount, now, title]
      );
      return;
    }
    await this.mockStore.updateGoalProgress(title, deltaAmount);
  }
}
