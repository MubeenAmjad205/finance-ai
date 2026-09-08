import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { Transaction } from '../types';

export class TransactionRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  private mapRowToTransaction(r: any): Transaction {
    return {
      _id: r.id,
      type: r.type,
      amount: Number(r.amount) || 0,
      originalAmount: r.originalAmount ? Number(r.originalAmount) : undefined,
      originalCurrency: r.originalCurrency || undefined,
      exchangeRate: r.exchangeRate ? Number(r.exchangeRate) : undefined,
      currency: r.currency || 'PKR',
      category: r.category,
      account: r.account,
      personId: r.personId || undefined,
      personName: r.personName || undefined,
      note: r.note || '',
      rawText: r.rawText || '',
      status: r.status || 'confirmed',
      timestamp: r.timestamp,
      telegramMessageId: r.telegramMessageId ? Number(r.telegramMessageId) : undefined,
      telegramUserId: r.telegramUserId || undefined,
      isVoiceNote: Boolean(r.isVoiceNote),
      voiceTranscription: r.voiceTranscription || undefined,
      isRecurring: Boolean(r.isRecurring),
      tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags) : [],
      createdAt: r.createdAt || new Date().toISOString()
    };
  }

  async create(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    if (this.neon.isConfigured) {
      const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const createdAt = new Date().toISOString();

      await this.neon.query(
        `INSERT INTO transactions (
          id, type, amount, "originalAmount", "originalCurrency", "exchangeRate",
          currency, category, account, "personId", "personName", note, "rawText",
          status, timestamp, "telegramMessageId", "telegramUserId", "isVoiceNote",
          "voiceTranscription", "isRecurring", tags, "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )`,
        [
          id,
          tx.type,
          tx.amount,
          tx.originalAmount || null,
          tx.originalCurrency || null,
          tx.exchangeRate || null,
          tx.currency || 'PKR',
          tx.category,
          tx.account,
          tx.personId || null,
          tx.personName || null,
          tx.note || '',
          tx.rawText || '',
          tx.status || 'confirmed',
          tx.timestamp || createdAt,
          tx.telegramMessageId || null,
          tx.telegramUserId ? String(tx.telegramUserId) : null,
          tx.isVoiceNote || false,
          tx.voiceTranscription || null,
          tx.isRecurring || false,
          JSON.stringify(tx.tags || []),
          createdAt
        ]
      );
      return id;
    }
    return this.mockStore.createTransaction(tx);
  }

  async getById(id: string): Promise<Transaction | null> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM transactions WHERE id = $1 LIMIT 1', [id]);
      if (rows.length === 0) return null;
      return this.mapRowToTransaction(rows[0]);
    }
    return this.mockStore.getTransactionById(id);
  }

  async update(id: string, update: Partial<Transaction>): Promise<boolean> {
    if (this.neon.isConfigured) {
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, val] of Object.entries(update)) {
        if (key === '_id' || key === 'id') continue;
        const colName = key === 'tags' ? 'tags' : `"${key}"`;
        const colVal = key === 'tags' ? JSON.stringify(val) : val;
        setClauses.push(`${colName} = $${idx++}`);
        values.push(colVal);
      }

      if (setClauses.length === 0) return true;
      values.push(id);

      await this.neon.query(
        `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${idx}`,
        values
      );
      return true;
    }
    return this.mockStore.updateTransaction(id, update);
  }

  async getLastConfirmed(): Promise<Transaction | null> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        "SELECT * FROM transactions WHERE status = 'confirmed' ORDER BY timestamp DESC LIMIT 1"
      );
      if (rows.length === 0) return null;
      return this.mapRowToTransaction(rows[0]);
    }
    return this.mockStore.getLastConfirmedTransaction();
  }

  async getRecent(limit = 10): Promise<Transaction[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        'SELECT * FROM transactions ORDER BY timestamp DESC LIMIT $1',
        [limit]
      );
      return rows.map(r => this.mapRowToTransaction(r));
    }
    return this.mockStore.getRecentTransactions(limit);
  }

  async getByMonth(monthIsoPrefix: string): Promise<Transaction[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        "SELECT * FROM transactions WHERE timestamp LIKE $1 ORDER BY timestamp DESC",
        [`${monthIsoPrefix}%`]
      );
      return rows.map(r => this.mapRowToTransaction(r));
    }
    return this.mockStore.getTransactionsByMonth(monthIsoPrefix);
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
    if (this.neon.isConfigured) {
      await this.neon.query('DELETE FROM transactions WHERE id = $1', [id]);
      return true;
    }
    return this.mockStore.deleteTransaction(id);
  }
}
