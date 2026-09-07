import { MongoDBAtlasClient } from '../client';
import { WhitelistEntry } from '../types';

export class WhitelistRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<WhitelistEntry[]> {
    const res = await this.client.execute<{ documents: WhitelistEntry[] }>('find', 'whitelist', {
      sort: { createdAt: -1 }
    });
    return res?.documents || [];
  }

  async isWhitelisted(userId: string | number): Promise<boolean> {
    const strId = String(userId);
    const res = await this.client.execute<{ document: WhitelistEntry }>('findOne', 'whitelist', {
      filter: { userId: strId }
    });
    return Boolean(res?.document);
  }

  async add(entry: Omit<WhitelistEntry, 'createdAt'>): Promise<WhitelistEntry> {
    const fullEntry: WhitelistEntry = {
      ...entry,
      userId: String(entry.userId),
      createdAt: new Date().toISOString()
    };

    await this.client.execute('updateOne', 'whitelist', {
      filter: { userId: fullEntry.userId },
      update: {
        $set: fullEntry
      },
      upsert: true
    });

    return fullEntry;
  }

  async remove(userId: string | number): Promise<boolean> {
    const strId = String(userId);
    const res = await this.client.execute<{ deletedCount: number }>('deleteOne', 'whitelist', {
      filter: { userId: strId }
    });
    return (res?.deletedCount || 0) > 0;
  }
}
