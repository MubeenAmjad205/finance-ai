import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { WhitelistEntry } from '../types';

export class WhitelistRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  async getAll(): Promise<WhitelistEntry[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM whitelist ORDER BY "createdAt" DESC');
      return rows.map(r => ({
        _id: r.id,
        userId: r.userId,
        username: r.username || undefined,
        firstName: r.firstName || undefined,
        role: r.role || 'member',
        addedBy: r.addedBy || 'system',
        chatType: r.chatType || 'personal',
        createdAt: r.createdAt || new Date().toISOString()
      }));
    }
    return this.mockStore.getWhitelist();
  }

  async isWhitelisted(userId: string | number): Promise<boolean> {
    const strId = String(userId);
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT 1 FROM whitelist WHERE "userId" = $1 LIMIT 1', [strId]);
      return rows.length > 0;
    }
    return this.mockStore.isWhitelisted(strId);
  }

  async add(entry: Omit<WhitelistEntry, 'createdAt'>): Promise<WhitelistEntry> {
    const id = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const fullEntry: WhitelistEntry = {
      _id: id,
      ...entry,
      userId: String(entry.userId),
      createdAt
    };

    if (this.neon.isConfigured) {
      await this.neon.query(
        `INSERT INTO whitelist (id, "userId", username, "firstName", role, "addedBy", "chatType", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ("userId") DO UPDATE SET username = EXCLUDED.username, "firstName" = EXCLUDED."firstName", role = EXCLUDED.role`,
        [
          id,
          fullEntry.userId,
          fullEntry.username || null,
          fullEntry.firstName || null,
          fullEntry.role || 'member',
          fullEntry.addedBy || 'system',
          fullEntry.chatType || 'personal',
          createdAt
        ]
      );
      return fullEntry;
    }
    return this.mockStore.addWhitelistEntry(fullEntry);
  }

  async remove(userId: string | number): Promise<boolean> {
    const strId = String(userId);
    if (this.neon.isConfigured) {
      await this.neon.query('DELETE FROM whitelist WHERE "userId" = $1', [strId]);
      return true;
    }
    return this.mockStore.removeWhitelistEntry(strId);
  }
}
