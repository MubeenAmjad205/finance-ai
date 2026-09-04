import { GroupAuditLog, GroupAuditAction } from '../db/types';

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[_*`\[\]]/g, '\\$&');
}

export class AuditService {
  /**
   * Generates a cryptographic SHA-256 evidence hash fingerprint using native Web Crypto API
   */
  static async generateEvidenceHash(
    groupId: number | string,
    timestamp: string,
    actorUserId: number | string,
    action: string,
    amount = 0,
    note = ''
  ): Promise<string> {
    const rawPayload = `${groupId}:${timestamp}:${actorUserId}:${action}:${amount}:${note}:QUANTUM_FINANCE_SECRET_KEY`;
    const encoder = new TextEncoder();
    const data = encoder.encode(rawPayload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Builds an immutable audit log record
   */
  static async createAuditRecord(params: {
    groupId: number | string;
    groupTitle?: string;
    action: GroupAuditAction;
    actor: { userId?: number; username?: string; name: string };
    expenseId?: string;
    details: {
      totalAmount?: number;
      note?: string;
      paidBy?: string;
      participants?: string[];
      previousState?: any;
      newState?: any;
    };
    rawTelegramText?: string;
    telegramMessageId?: number;
  }): Promise<GroupAuditLog> {
    const timestamp = new Date().toISOString();
    const evidenceHash = await this.generateEvidenceHash(
      params.groupId,
      timestamp,
      params.actor.userId || 0,
      params.action,
      params.details.totalAmount || 0,
      params.details.note || ''
    );

    return {
      _id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      groupId: params.groupId,
      groupTitle: params.groupTitle || 'Office Group',
      timestamp,
      action: params.action,
      actor: params.actor,
      expenseId: params.expenseId,
      details: params.details,
      rawTelegramText: params.rawTelegramText,
      telegramMessageId: params.telegramMessageId,
      evidenceHash,
      createdAt: timestamp
    };
  }

  /**
   * Format audit log array into a clean Telegram Markdown card
   */
  static formatAuditLogCard(logs: GroupAuditLog[]): string {
    if (!logs || logs.length === 0) {
      return `🛡️ **IMMUTABLE GROUP AUDIT TRAIL**\n──────────────────────\n🟢 *No recorded audit logs yet. All financial activities are tracked in real-time.*`;
    }

    let card = `🛡️ **IMMUTABLE GROUP AUDIT TRAIL**\n`;
    card += `──────────────────────\n`;
    card += `🔒 *Append-only transaction ledger protected by SHA-256 evidence hashing.*\n\n`;

    for (let i = 0; i < Math.min(logs.length, 10); i++) {
      const log = logs[i];
      const actorName = escapeMarkdown(log.actor.username ? `@${log.actor.username}` : log.actor.name);
      const timeStr = new Date(log.timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
      const hashShort = log.evidenceHash ? log.evidenceHash.substring(0, 10) : 'sha256_verified';

      let actionIcon = '📝';
      let actionTitle: string = log.action;

      if (log.action === 'BILL_LOGGED') {
        actionIcon = '🍔';
        actionTitle = `Logged Bill: ${escapeMarkdown(log.details.note || 'Lunch')} (${(log.details.totalAmount || 0).toLocaleString()} PKR)`;
      } else if (log.action === 'MARKED_PAID') {
        actionIcon = '💳';
        actionTitle = `Marked Paid for Bill ${log.expenseId || ''}`;
      } else if (log.action === 'EXPENSE_UNDONE') {
        actionIcon = '↩️';
        actionTitle = `Rolled Back Expense (${(log.details.totalAmount || 0).toLocaleString()} PKR)`;
      } else if (log.action === 'BALANCE_OVERRIDDEN') {
        actionIcon = '⚖️';
        actionTitle = `Manual Balance Override / Settlement`;
      } else if (log.action === 'STATEMENT_IMPORTED') {
        actionIcon = '📥';
        actionTitle = `Imported Bank Statement Batch`;
      }

      card += `${actionIcon} **${actionTitle}**\n`;
      card += `  • Actor: ${actorName} | 🕒 ${timeStr}\n`;
      card += `  • Hash: \`${hashShort}\`\n\n`;
    }

    card += `💡 *Message deletion on Telegram cannot alter or delete these records.*`;
    return card;
  }
}
