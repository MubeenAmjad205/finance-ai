import { Transaction } from '../../db/types';
import { MongoDBClient } from '../../db/mongodb';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface UserFinancialMemory {
  chatId: string;
  preferredAccount?: string;
  frequentCounterparties: string[];
  frequentCategories: string[];
  frequentMerchants: string[];
  customNotes: string[];
  updatedAt: string;
}

export class MemoryService {
  // Short-term sliding window memory store (in-memory per worker instance with TTL)
  private static shortTermStore = new Map<string, ConversationTurn[]>();
  private static readonly SHORT_TERM_TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly MAX_SHORT_TERM_TURNS = 8;

  // Long-term persistent memory store (in-memory cache + Neon Postgres backed)
  private static longTermCache = new Map<string, UserFinancialMemory>();

  /**
   * Record a conversational turn into short-term working memory
   */
  static recordTurn(chatId: string | number, role: 'user' | 'assistant', content: string): void {
    const key = String(chatId);
    let turns = this.shortTermStore.get(key) || [];
    
    // Prune stale turns
    const now = Date.now();
    turns = turns.filter(t => now - t.timestamp < this.SHORT_TERM_TTL_MS);

    turns.push({
      role,
      content: content.trim(),
      timestamp: now
    });

    if (turns.length > this.MAX_SHORT_TERM_TURNS) {
      turns = turns.slice(turns.length - this.MAX_SHORT_TERM_TURNS);
    }

    this.shortTermStore.set(key, turns);
  }

  /**
   * Get recent short-term conversation history for context injection
   */
  static getShortTermHistory(chatId: string | number): ConversationTurn[] {
    const key = String(chatId);
    const turns = this.shortTermStore.get(key) || [];
    const now = Date.now();
    return turns.filter(t => now - t.timestamp < this.SHORT_TERM_TTL_MS);
  }

  /**
   * Fetch long-term memory for user (with Neon Postgres DB backing)
   */
  static async getUserMemory(chatId: string | number, db?: MongoDBClient): Promise<UserFinancialMemory> {
    const key = String(chatId);
    let cached = this.longTermCache.get(key);

    if (cached) return cached;

    if (db && db.neon.isConfigured) {
      try {
        const rows = await db.neon.query<any>('SELECT * FROM user_memories WHERE "chatId" = $1 LIMIT 1', [key]);
        if (rows.length > 0) {
          const r = rows[0];
          const fetched: UserFinancialMemory = {
            chatId: r.chatId,
            preferredAccount: r.preferredAccount || undefined,
            frequentCounterparties: Array.isArray(r.frequentCounterparties) ? r.frequentCounterparties : typeof r.frequentCounterparties === 'string' ? JSON.parse(r.frequentCounterparties) : [],
            frequentCategories: Array.isArray(r.frequentCategories) ? r.frequentCategories : typeof r.frequentCategories === 'string' ? JSON.parse(r.frequentCategories) : [],
            frequentMerchants: Array.isArray(r.frequentMerchants) ? r.frequentMerchants : typeof r.frequentMerchants === 'string' ? JSON.parse(r.frequentMerchants) : [],
            customNotes: Array.isArray(r.customNotes) ? r.customNotes : typeof r.customNotes === 'string' ? JSON.parse(r.customNotes) : [],
            updatedAt: r.updatedAt || new Date().toISOString()
          };
          this.longTermCache.set(key, fetched);
          return fetched;
        }
      } catch (err) {
        console.error('[MemoryService getUserMemory DB Fetch Error]:', err);
      }
    }

    const defaultMem: UserFinancialMemory = {
      chatId: key,
      frequentCounterparties: [],
      frequentCategories: [],
      frequentMerchants: [],
      customNotes: [],
      updatedAt: new Date().toISOString()
    };
    this.longTermCache.set(key, defaultMem);
    return defaultMem;
  }

  /**
   * Persist user long-term memory to cache and Neon Postgres
   */
  private static async persistMemory(mem: UserFinancialMemory, db?: MongoDBClient): Promise<void> {
    this.longTermCache.set(mem.chatId, mem);

    if (db && db.neon.isConfigured) {
      try {
        const id = `mem_${mem.chatId}`;
        await db.neon.query(
          `INSERT INTO user_memories (
            id, "chatId", "preferredAccount", "frequentCounterparties", "frequentCategories", "frequentMerchants", "customNotes", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT ("chatId") DO UPDATE SET
            "preferredAccount" = EXCLUDED."preferredAccount",
            "frequentCounterparties" = EXCLUDED."frequentCounterparties",
            "frequentCategories" = EXCLUDED."frequentCategories",
            "frequentMerchants" = EXCLUDED."frequentMerchants",
            "customNotes" = EXCLUDED."customNotes",
            "updatedAt" = EXCLUDED."updatedAt"`,
          [
            id,
            mem.chatId,
            mem.preferredAccount || null,
            JSON.stringify(mem.frequentCounterparties),
            JSON.stringify(mem.frequentCategories),
            JSON.stringify(mem.frequentMerchants),
            JSON.stringify(mem.customNotes),
            mem.updatedAt
          ]
        );
      } catch (err) {
        console.error('[MemoryService persistMemory DB Persist Error]:', err);
      }
    }
  }

  /**
   * Update long-term memory based on confirmed transactions
   */
  static async learnFromTransaction(chatId: string | number, tx: Partial<Transaction>, db?: MongoDBClient): Promise<void> {
    const key = String(chatId);
    let mem = await this.getUserMemory(key, db);

    // 1. Learn preferred account
    if (tx.account) {
      mem.preferredAccount = tx.account;
    }

    // 2. Learn counterparties
    if (tx.personName && !mem.frequentCounterparties.includes(tx.personName)) {
      mem.frequentCounterparties.push(tx.personName);
      if (mem.frequentCounterparties.length > 5) mem.frequentCounterparties.shift();
    }

    // 3. Learn categories
    if (tx.category && !mem.frequentCategories.includes(tx.category)) {
      mem.frequentCategories.push(tx.category);
      if (mem.frequentCategories.length > 6) mem.frequentCategories.shift();
    }

    // 4. Learn merchants from note (if note is not just the person's name)
    if (tx.note) {
      const trimmedNote = tx.note.trim();
      if (trimmedNote.length < 30 && trimmedNote.toLowerCase() !== tx.personName?.trim().toLowerCase() && !mem.frequentMerchants.includes(trimmedNote)) {
        mem.frequentMerchants.push(trimmedNote);
        if (mem.frequentMerchants.length > 5) mem.frequentMerchants.shift();
      }
    }

    mem.updatedAt = new Date().toISOString();
    await this.persistMemory(mem, db);
  }

  /**
   * Save a user account note or custom preference in long term memory
   */
  static async recordCustomNote(chatId: string | number, note: string, db?: MongoDBClient): Promise<void> {
    const key = String(chatId);
    let mem = await this.getUserMemory(key, db);

    if (!mem.customNotes) mem.customNotes = [];
    if (!mem.customNotes.includes(note)) {
      mem.customNotes.push(note);
      if (mem.customNotes.length > 10) mem.customNotes.shift();
    }
    mem.updatedAt = new Date().toISOString();
    await this.persistMemory(mem, db);
  }

  /**
   * Generate token-efficient structured memory prompt block for LLM
   */
  static async getStructuredMemoryContext(chatId: string | number, db?: MongoDBClient): Promise<string> {
    const key = String(chatId);
    const mem = await this.getUserMemory(key, db);
    const shortHistory = this.getShortTermHistory(chatId);

    const parts: string[] = [];

    if (mem) {
      const longTermLines: string[] = [];
      if (mem.preferredAccount) longTermLines.push(`- Preferred Payment Method: ${mem.preferredAccount}`);
      if (mem.frequentCounterparties.length > 0) longTermLines.push(`- Regular Counterparties: ${mem.frequentCounterparties.join(', ')}`);
      if (mem.frequentMerchants.length > 0) longTermLines.push(`- Frequent Merchants: ${mem.frequentMerchants.join(', ')}`);
      if (mem.frequentCategories.length > 0) longTermLines.push(`- Top Categories: ${mem.frequentCategories.join(', ')}`);
      if (mem.customNotes.length > 0) longTermLines.push(`- Notes: ${mem.customNotes.join('; ')}`);

      if (longTermLines.length > 0) {
        parts.push(`[LONG-TERM USER MEMORY & PREFERENCES]\n${longTermLines.join('\n')}`);
      }
    }

    if (shortHistory.length > 0) {
      const recentChat = shortHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
      parts.push(`[RECENT CONVERSATION CONTEXT]\n${recentChat}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Set a custom note in user's long-term memory
   */
  static async addCustomNote(chatId: string | number, note: string, db?: MongoDBClient): Promise<void> {
    await this.recordCustomNote(chatId, note, db);
  }
}
