import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { Reminder } from '../types';

export class ReminderRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  async getAll(): Promise<Reminder[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM reminders ORDER BY "createdAt" DESC');
      return rows.map(r => ({
        _id: r.id,
        text: r.text,
        chatId: r.chatId || undefined,
        dueAt: r.dueAt || undefined,
        isTriggered: Boolean(r.isTriggered),
        createdAt: r.createdAt || new Date().toISOString()
      }));
    }
    return this.mockStore.getReminders();
  }

  async add(text: string, chatId?: string | number): Promise<Reminder> {
    const id = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const reminder: Reminder = {
      _id: id,
      text,
      chatId,
      isTriggered: false,
      createdAt
    };

    if (this.neon.isConfigured) {
      await this.neon.query(
        `INSERT INTO reminders (id, text, "chatId", "isTriggered", "createdAt")
         VALUES ($1, $2, $3, FALSE, $4)`,
        [id, text, chatId ? String(chatId) : null, createdAt]
      );
      return reminder;
    }
    return this.mockStore.addReminder(text, chatId);
  }
}
