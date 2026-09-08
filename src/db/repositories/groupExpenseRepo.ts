import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';

export class GroupExpenseRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  private mapRowToExpense(r: any): any {
    return {
      _id: r.id,
      billCode: r.billCode || undefined,
      groupId: r.groupId,
      groupTitle: r.groupTitle || undefined,
      totalAmount: Number(r.totalAmount) || 0,
      paidBy: typeof r.paidBy === 'string' ? JSON.parse(r.paidBy) : r.paidBy,
      note: r.note || '',
      participants: typeof r.participants === 'string' ? JSON.parse(r.participants) : r.participants || [],
      timestamp: r.timestamp || new Date().toISOString(),
      createdAt: r.createdAt || new Date().toISOString()
    };
  }

  async create(exp: any): Promise<string> {
    if (this.neon.isConfigured) {
      const id = exp._id || `gexp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const createdAt = new Date().toISOString();

      await this.neon.query(
        `INSERT INTO group_expenses (
          id, "billCode", "groupId", "groupTitle", "totalAmount", "paidBy", note, participants, timestamp, "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          exp.billCode || null,
          String(exp.groupId || ''),
          exp.groupTitle || null,
          exp.totalAmount || 0,
          JSON.stringify(exp.paidBy || {}),
          exp.note || '',
          JSON.stringify(exp.participants || []),
          exp.timestamp || createdAt,
          createdAt
        ]
      );
      return id;
    }
    return this.mockStore.createGroupExpense(exp);
  }

  async getByGroupId(groupId: string | number): Promise<any[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        'SELECT * FROM group_expenses WHERE "groupId" = $1 ORDER BY timestamp DESC',
        [String(groupId)]
      );
      return rows.map(r => this.mapRowToExpense(r));
    }
    return this.mockStore.getGroupExpensesByGroupId(groupId);
  }

  async update(id: string, update: Record<string, any>): Promise<boolean> {
    if (this.neon.isConfigured) {
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, val] of Object.entries(update)) {
        if (key === '_id' || key === 'id') continue;
        const isJson = key === 'paidBy' || key === 'participants';
        setClauses.push(`"${key}" = $${idx++}`);
        values.push(isJson ? JSON.stringify(val) : val);
      }

      if (setClauses.length === 0) return true;
      values.push(id);

      await this.neon.query(`UPDATE group_expenses SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
      return true;
    }
    return this.mockStore.updateGroupExpense(id, update);
  }

  async delete(id: string): Promise<boolean> {
    if (this.neon.isConfigured) {
      await this.neon.query('DELETE FROM group_expenses WHERE id = $1', [id]);
      return true;
    }
    return this.mockStore.deleteGroupExpense(id);
  }

  async getLast(groupId: string | number): Promise<any | null> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        'SELECT * FROM group_expenses WHERE "groupId" = $1 ORDER BY timestamp DESC LIMIT 1',
        [String(groupId)]
      );
      if (rows.length === 0) return null;
      return this.mapRowToExpense(rows[0]);
    }
    return this.mockStore.getLastGroupExpense(groupId);
  }
}
