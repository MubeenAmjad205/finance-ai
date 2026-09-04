import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';

export class GroupAuditRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  private buildGroupIdFilter(groupId: string | number) {
    const strVal = String(groupId);
    const numVal = Number(groupId);
    if (!isNaN(numVal)) {
      return { $or: [{ groupId: strVal }, { groupId: numVal }] };
    }
    return { groupId: strVal };
  }

  async create(audit: any): Promise<string> {
    const doc = { ...audit, createdAt: new Date().toISOString() };
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ insertedId: string }>('insertOne', 'group_audit_logs', { document: doc });
      return res?.insertedId || doc._id || 'audit_' + Date.now();
    }
    return doc._id || 'audit_' + Date.now();
  }

  async getByGroupId(groupId: string | number, limit = 20): Promise<any[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: any[] }>('find', 'group_audit_logs', {
        filter: this.buildGroupIdFilter(groupId),
        sort: { timestamp: -1 },
        limit
      });
      return res?.documents || [];
    }
    return [];
  }
}
