import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { Reminder } from '../types';

export class ReminderRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<Reminder[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Reminder[] }>('find', 'reminders', {
        sort: { createdAt: -1 }
      });
      return res?.documents || [];
    }
    return this.mockStore.reminders;
  }

  async add(text: string, chatId?: string | number): Promise<Reminder> {
    const reminder: Reminder = {
      text,
      chatId,
      isTriggered: false,
      createdAt: new Date().toISOString()
    };

    if (this.client.isConfigured) {
      const res = await this.client.execute<{ insertedId: string }>('insertOne', 'reminders', {
        document: reminder
      });
      return { ...reminder, _id: res?.insertedId };
    }

    const mockReminder = { ...reminder, _id: 'rem_' + Date.now() };
    this.mockStore.reminders.unshift(mockReminder);
    return mockReminder;
  }
}
