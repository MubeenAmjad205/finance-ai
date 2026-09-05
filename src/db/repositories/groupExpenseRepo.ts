import { MongoDBAtlasClient } from '../client';

export class GroupExpenseRepository {
  constructor(private client: MongoDBAtlasClient) {}

  private buildGroupIdFilter(groupId: string | number) {
    const strVal = String(groupId);
    const numVal = Number(groupId);
    if (!isNaN(numVal)) {
      return { $or: [{ groupId: strVal }, { groupId: numVal }] };
    }
    return { groupId: strVal };
  }

  async create(exp: any): Promise<string> {
    const doc = { ...exp, createdAt: new Date().toISOString() };
    const res = await this.client.execute<{ insertedId: string }>('insertOne', 'group_expenses', { document: doc });
    return res?.insertedId || doc._id || 'gexp_' + Date.now();
  }

  async getByGroupId(groupId: string | number): Promise<any[]> {
    const res = await this.client.execute<{ documents: any[] }>('find', 'group_expenses', {
      filter: this.buildGroupIdFilter(groupId),
      sort: { timestamp: -1 }
    });
    return res?.documents || [];
  }

  async update(id: string, update: Record<string, any>): Promise<boolean> {
    const res = await this.client.execute<{ matchedCount: number }>('updateOne', 'group_expenses', {
      filter: { _id: id.length === 24 ? { $oid: id } : id },
      update: { $set: update }
    });
    return (res?.matchedCount || 0) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.client.execute<{ deletedCount: number }>('deleteOne', 'group_expenses', {
      filter: { _id: id.length === 24 ? { $oid: id } : id }
    });
    return (res?.deletedCount || 0) > 0;
  }

  async getLast(groupId: string | number): Promise<any | null> {
    const res = await this.client.execute<{ documents: any[] }>('find', 'group_expenses', {
      filter: this.buildGroupIdFilter(groupId),
      sort: { timestamp: -1 },
      limit: 1
    });
    return res?.documents?.[0] || null;
  }
}
