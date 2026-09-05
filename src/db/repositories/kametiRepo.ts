import { MongoDBAtlasClient } from '../client';
import { Kameti, KametiMember } from '../types';

export class KametiRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<Kameti[]> {
    const res = await this.client.execute<{ documents: Kameti[] }>('find', 'kametis', {
      sort: { createdAt: -1 }
    });
    return res?.documents || [];
  }

  async getById(id: string): Promise<Kameti | null> {
    const res = await this.client.execute<{ document: Kameti }>('findOne', 'kametis', {
      filter: { _id: id.length === 24 ? { $oid: id } : id }
    });
    return res?.document || null;
  }

  async getByName(name: string): Promise<Kameti | null> {
    const res = await this.client.execute<{ document: Kameti }>('findOne', 'kametis', {
      filter: { name: { $regex: `^${name}$`, $options: 'i' } }
    });
    return res?.document || null;
  }

  async create(data: Omit<Kameti, '_id' | 'createdAt'>): Promise<Kameti> {
    const kameti: Kameti = {
      ...data,
      createdAt: new Date().toISOString()
    };

    const res = await this.client.execute<{ insertedId: string }>('insertOne', 'kametis', {
      document: kameti
    });
    return { ...kameti, _id: res?.insertedId };
  }

  async markPaid(kametiIdOrName: string, memberName: string, month?: number): Promise<boolean> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return false;

    const targetMonth = month || kameti.currentMonth;
    const memberIndex = kameti.members.findIndex(
      m => m.name.toLowerCase() === memberName.toLowerCase()
    );
    if (memberIndex === -1) return false;

    const member = kameti.members[memberIndex];
    if (!member.paidMonths.includes(targetMonth)) {
      member.paidMonths.push(targetMonth);
      member.paidMonths.sort((a, b) => a - b);
    }

    const res = await this.client.execute<{ matchedCount: number }>('updateOne', 'kametis', {
      filter: { _id: kameti._id?.length === 24 ? { $oid: kameti._id } : kameti._id },
      update: { $set: { members: kameti.members } }
    });
    return (res?.matchedCount || 0) > 0;
  }

  async markPayoutReceived(kametiIdOrName: string, memberName: string): Promise<boolean> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return false;

    const memberIndex = kameti.members.findIndex(
      m => m.name.toLowerCase() === memberName.toLowerCase()
    );
    if (memberIndex === -1) return false;

    kameti.members[memberIndex].payoutReceived = true;

    const res = await this.client.execute<{ matchedCount: number }>('updateOne', 'kametis', {
      filter: { _id: kameti._id?.length === 24 ? { $oid: kameti._id } : kameti._id },
      update: { $set: { members: kameti.members } }
    });
    return (res?.matchedCount || 0) > 0;
  }

  async advanceMonth(kametiIdOrName: string): Promise<number | null> {
    const kameti = await this.getByName(kametiIdOrName) || await this.getById(kametiIdOrName);
    if (!kameti) return null;

    if (kameti.currentMonth >= kameti.totalMonths) {
      kameti.status = 'completed';
    } else {
      kameti.currentMonth += 1;
    }

    await this.client.execute('updateOne', 'kametis', {
      filter: { _id: kameti._id?.length === 24 ? { $oid: kameti._id } : kameti._id },
      update: { $set: { currentMonth: kameti.currentMonth, status: kameti.status } }
    });
    return kameti.currentMonth;
  }
}
