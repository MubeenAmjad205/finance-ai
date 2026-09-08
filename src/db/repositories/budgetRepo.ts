import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { BudgetCap } from '../types';

export class BudgetRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  async getAll(): Promise<BudgetCap[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM budgets ORDER BY category ASC');
      return rows.map(r => ({
        _id: r.id,
        category: r.category,
        monthlyLimit: Number(r.monthlyLimit) || 0,
        alertThresholdPct: Number(r.alertThresholdPct) || 80,
        updatedAt: r.updatedAt || new Date().toISOString()
      }));
    }
    return this.mockStore.getBudgetCaps();
  }

  async setLimit(category: string, monthlyLimit: number, alertThresholdPct = 80): Promise<BudgetCap> {
    const updatedAt = new Date().toISOString();
    const capData: BudgetCap = {
      category,
      monthlyLimit,
      alertThresholdPct,
      updatedAt
    };

    if (this.neon.isConfigured) {
      const id = `budget_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await this.neon.query(
        `INSERT INTO budgets (id, category, "monthlyLimit", "alertThresholdPct", "updatedAt")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (category) DO UPDATE SET "monthlyLimit" = EXCLUDED."monthlyLimit", "alertThresholdPct" = EXCLUDED."alertThresholdPct", "updatedAt" = EXCLUDED."updatedAt"`,
        [id, category, monthlyLimit, alertThresholdPct, updatedAt]
      );
      return capData;
    }
    return this.mockStore.setBudgetCap(category, monthlyLimit, alertThresholdPct);
  }
}
