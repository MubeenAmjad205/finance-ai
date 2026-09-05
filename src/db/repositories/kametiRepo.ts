import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { Kameti, KametiMember } from '../types';

export class KametiRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<Kameti[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Kameti[] }>('find', 'kametis', {
        sort: { createdAt: -1 }
      });
      if (res?.documents && res.documents.length > 0) {
        return res.documents;
      }
    }
    return this.mockStore.kametis;
  }

  async getById(id: string): Promise<Kameti | null> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ document: Kameti }>('findOne', 'kametis', {
        filter: { _id: { $oid: id } }
      });
      if (res?.document) return res.document;
    }
    return this.mockStore.kametis.find(k => k._id === id) || null;
  }

  async getByName(name: string): Promise<Kameti | null> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ document: Kameti }>('findOne', 'kametis', {
        filter: { name: { $regex: `^${name}$`, $options: 'i' } }
      });
      if (res?.document) return res.document;
    }
    return this.mockStore.kametis.find(k => k.name.toLowerCase() === name.toLowerCase()) || null;
  }

  async create(data: Omit<Kameti, '_id' | 'createdAt'>): Promise<Kameti> {
    const kameti: Kameti = {
      ...data,
      createdAt: new Date().toISOString()
    };

    if (this.client.isConfigured) {
      const res = await this.client.execute<{ insertedId: string }>('insertOne', 'kametis', {
        document: kameti
      });
      return { ...kameti, _id: res?.insertedId };
    }

    const newKameti = { ...kameti, _id: 'kameti_' + Date.now() };
    this.mockStore.kametis.push(newKameti);
    return newKameti;
  }

  async markPaid(kametiIdOrName: string, memberName: string, month?: number): Promise<boolean> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return false;

    const targetMonth = month || kameti.currentMonth;
    const member = kameti.members.find(m => m.name.toLowerCase().includes(memberName.toLowerCase()));
    if (!member) return false;

    if (!member.paidMonths.includes(targetMonth)) {
      member.paidMonths.push(targetMonth);
    }

    if (this.client.isConfigured && kameti._id) {
      await this.client.execute('updateOne', 'kametis', {
        filter: { _id: { $oid: kameti._id } },
        update: { $set: { members: kameti.members } }
      });
    }
    return true;
  }

  async markPayoutReceived(kametiIdOrName: string, memberName: string): Promise<boolean> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return false;

    const member = kameti.members.find(m => m.name.toLowerCase().includes(memberName.toLowerCase()));
    if (!member) return false;

    member.payoutReceived = true;

    if (this.client.isConfigured && kameti._id) {
      await this.client.execute('updateOne', 'kametis', {
        filter: { _id: { $oid: kameti._id } },
        update: { $set: { members: kameti.members } }
      });
    }
    return true;
  }

  async advanceMonth(kametiIdOrName: string): Promise<number | null> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return null;

    if (kameti.currentMonth < kameti.totalMonths) {
      kameti.currentMonth += 1;
    } else {
      kameti.status = 'completed';
    }

    if (this.client.isConfigured && kameti._id) {
      await this.client.execute('updateOne', 'kametis', {
        filter: { _id: { $oid: kameti._id } },
        update: { $set: { currentMonth: kameti.currentMonth, status: kameti.status } }
      });
    }
    return kameti.currentMonth;
  }
}
