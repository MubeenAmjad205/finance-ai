import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';

export class GroupAuditRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  private mapRowToAudit(r: any): any {
    return {
      _id: r.id,
      groupId: r.groupId,
      groupTitle: r.groupTitle || undefined,
      timestamp: r.timestamp || new Date().toISOString(),
      action: r.action,
      actor: typeof r.actor === 'string' ? JSON.parse(r.actor) : r.actor,
      expenseId: r.expenseId || undefined,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      rawTelegramText: r.rawTelegramText || undefined,
      telegramMessageId: r.telegramMessageId ? Number(r.telegramMessageId) : undefined,
      evidenceHash: r.evidenceHash || '',
      createdAt: r.createdAt || new Date().toISOString()
    };
  }

  async create(audit: any): Promise<string> {
    if (this.neon.isConfigured) {
      const id = audit._id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const createdAt = new Date().toISOString();

      await this.neon.query(
        `INSERT INTO group_audit_logs (
          id, "groupId", "groupTitle", timestamp, action, actor, "expenseId",
          details, "rawTelegramText", "telegramMessageId", "evidenceHash", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          String(audit.groupId || ''),
          audit.groupTitle || null,
          audit.timestamp || createdAt,
          audit.action,
          JSON.stringify(audit.actor || {}),
          audit.expenseId || null,
          JSON.stringify(audit.details || {}),
          audit.rawTelegramText || null,
          audit.telegramMessageId || null,
          audit.evidenceHash || '',
          createdAt
        ]
      );
      return id;
    }
    return this.mockStore.createGroupAuditLog(audit);
  }

  async getByGroupId(groupId: string | number, limit = 20): Promise<any[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>(
        'SELECT * FROM group_audit_logs WHERE "groupId" = $1 ORDER BY timestamp DESC LIMIT $2',
        [String(groupId), limit]
      );
      return rows.map(r => this.mapRowToAudit(r));
    }
    return this.mockStore.getGroupAuditLogsByGroupId(groupId, limit);
  }
}
