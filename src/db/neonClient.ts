import { neon } from '@neondatabase/serverless';
import { Env } from './types';

export class NeonPostgresClient {
  private sqlClient: any = null;
  public readonly isConfigured: boolean;
  public lastError: string | null = null;
  private autoMigrated = false;

  constructor(env: Env) {
    const connectionString = env.DATABASE_URL || '';
    if (
      connectionString &&
      (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://'))
    ) {
      try {
        this.sqlClient = neon(connectionString);
        this.isConfigured = true;
      } catch (err: any) {
        console.error('[NeonPostgresClient Init Error]:', err);
        this.lastError = err?.message || String(err);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
    }
  }

  async query<T = any>(queryText: string, params: any[] = []): Promise<T[]> {
    if (!this.isConfigured || !this.sqlClient) {
      return [];
    }
    try {
      await this.ensureSchema();
      const rows = await this.sqlClient(queryText, params);
      this.lastError = null;
      return (rows as unknown) as T[];
    } catch (err: any) {
      console.error(`[Neon Postgres Error] Query failed: "${queryText.substring(0, 100)}..."`, err.message || err);
      this.lastError = err?.message || String(err);
      return [];
    }
  }

  /**
   * Auto-provisions PostgreSQL tables on first connection if they do not exist
   */
  private async ensureSchema(): Promise<void> {
    if (this.autoMigrated || !this.sqlClient) return;
    this.autoMigrated = true;

    try {
      await this.sqlClient(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          balance DOUBLE PRECISION DEFAULT 0,
          currency TEXT DEFAULT 'PKR',
          type TEXT DEFAULT 'mobile_wallet',
          "updatedAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          "originalAmount" DOUBLE PRECISION,
          "originalCurrency" TEXT,
          "exchangeRate" DOUBLE PRECISION,
          currency TEXT DEFAULT 'PKR',
          category TEXT NOT NULL,
          account TEXT NOT NULL,
          "personId" TEXT,
          "personName" TEXT,
          note TEXT,
          "rawText" TEXT,
          status TEXT DEFAULT 'confirmed',
          timestamp TEXT NOT NULL,
          "telegramMessageId" INTEGER,
          "telegramUserId" TEXT,
          "isVoiceNote" BOOLEAN DEFAULT FALSE,
          "voiceTranscription" TEXT,
          "isRecurring" BOOLEAN DEFAULT FALSE,
          tags JSONB DEFAULT '[]'::jsonb,
          "createdAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS persons (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          aliases JSONB DEFAULT '[]'::jsonb,
          accounts JSONB DEFAULT '[]'::jsonb,
          "netBalance" DOUBLE PRECISION DEFAULT 0,
          notes TEXT,
          "createdAt" TEXT,
          "updatedAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY,
          category TEXT UNIQUE NOT NULL,
          "monthlyLimit" DOUBLE PRECISION NOT NULL,
          "alertThresholdPct" DOUBLE PRECISION DEFAULT 80,
          "updatedAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY,
          title TEXT UNIQUE NOT NULL,
          "targetAmount" DOUBLE PRECISION NOT NULL,
          "currentAmount" DOUBLE PRECISION DEFAULT 0,
          "updatedAt" TEXT,
          "createdAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          "chatId" TEXT,
          "dueAt" TEXT,
          "isTriggered" BOOLEAN DEFAULT FALSE,
          "createdAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS group_expenses (
          id TEXT PRIMARY KEY,
          "billCode" TEXT,
          "groupId" TEXT,
          "groupTitle" TEXT,
          "totalAmount" DOUBLE PRECISION DEFAULT 0,
          "paidBy" JSONB,
          note TEXT,
          participants JSONB,
          timestamp TEXT,
          "createdAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS group_audit_logs (
          id TEXT PRIMARY KEY,
          "groupId" TEXT,
          "groupTitle" TEXT,
          timestamp TEXT,
          action TEXT NOT NULL,
          actor JSONB,
          "expenseId" TEXT,
          details JSONB,
          "rawTelegramText" TEXT,
          "telegramMessageId" INTEGER,
          "evidenceHash" TEXT,
          "createdAt" TEXT
        );

        CREATE TABLE IF NOT EXISTS user_memories (
          id TEXT PRIMARY KEY,
          "chatId" TEXT UNIQUE NOT NULL,
          "preferredAccount" TEXT,
          "frequentCounterparties" JSONB DEFAULT '[]'::jsonb,
          "frequentCategories" JSONB DEFAULT '[]'::jsonb,
          "frequentMerchants" JSONB DEFAULT '[]'::jsonb,
          "customNotes" JSONB DEFAULT '[]'::jsonb,
          "updatedAt" TEXT
        );
      `);
    } catch (err: any) {
      console.warn('[Neon Schema Auto-Migration Warning]:', err.message || err);
    }
  }
}
