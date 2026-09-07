import { MongoDBAtlasClient } from '../client';
import { Person } from '../types';

export class PersonRepository {
  constructor(private client: MongoDBAtlasClient) {}

  async getAll(): Promise<Person[]> {
    const res = await this.client.execute<{ documents: Person[] }>('find', 'persons', {
      sort: { name: 1 }
    });
    return res?.documents || [];
  }

  async findByNameOrAlias(name: string): Promise<Person | null> {
    const trimmed = name.trim();
    const esc = this.escapeRegex(trimmed);

    const res = await this.client.execute<{ document: Person }>('findOne', 'persons', {
      filter: {
        $or: [
          { name: { $regex: `^${esc}$`, $options: 'i' } },
          { aliases: { $elemMatch: { $regex: `^${esc}$`, $options: 'i' } } }
        ]
      }
    });
    return res?.document || null;
  }

  async create(name: string, initialAccount?: string): Promise<Person> {
    const newPerson: Person = {
      name,
      aliases: [name],
      accounts: initialAccount ? [initialAccount] : ['Default'],
      netBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const res = await this.client.execute<{ insertedId: string }>('insertOne', 'persons', {
      document: newPerson
    });
    return { ...newPerson, _id: res?.insertedId };
  }

  async updateBalance(personId: string, delta: number): Promise<void> {
    await this.client.execute('updateOne', 'persons', {
      filter: { _id: personId.length === 24 ? { $oid: personId } : personId },
      update: {
        $inc: { netBalance: delta },
        $set: { updatedAt: new Date().toISOString() }
      }
    });
  }

  async addAlias(personId: string, alias: string): Promise<void> {
    await this.client.execute('updateOne', 'persons', {
      filter: { _id: personId.length === 24 ? { $oid: personId } : personId },
      update: {
        $addToSet: { aliases: alias },
        $set: { updatedAt: new Date().toISOString() }
      }
    });
  }

  async addAccount(personId: string, accountName: string): Promise<void> {
    await this.client.execute('updateOne', 'persons', {
      filter: { _id: personId.length === 24 ? { $oid: personId } : personId },
      update: {
        $addToSet: { accounts: accountName },
        $set: { updatedAt: new Date().toISOString() }
      }
    });
  }

  async getDebtSummary(): Promise<{ owedToMe: Person[]; iOwe: Person[] }> {
    const all = await this.getAll();
    return {
      owedToMe: all.filter(p => p.netBalance > 0),
      iOwe: all.filter(p => p.netBalance < 0)
    };
  }

  async merge(primaryId: string, targetId: string, aliasToAdd?: string): Promise<Person | null> {
    const targetRes = await this.client.execute<{ document: Person }>('findOne', 'persons', {
      filter: { _id: targetId.length === 24 ? { $oid: targetId } : targetId }
    });
    const target = targetRes?.document;
    if (!target) return null;

    const aliasesToAdd = [target.name, ...target.aliases];
    if (aliasToAdd && !aliasesToAdd.includes(aliasToAdd)) {
      aliasesToAdd.push(aliasToAdd);
    }

    await this.client.execute('updateOne', 'persons', {
      filter: { _id: primaryId.length === 24 ? { $oid: primaryId } : primaryId },
      update: {
        $addToSet: { aliases: { $each: aliasesToAdd } },
        $inc: { netBalance: target.netBalance },
        $set: { updatedAt: new Date().toISOString() }
      }
    });

    // Reassign transactions from target to primary
    await this.client.execute('updateMany', 'transactions', {
      filter: { personId: targetId },
      update: { $set: { personId: primaryId } }
    });

    // Delete target person
    await this.client.execute('deleteOne', 'persons', {
      filter: { _id: targetId.length === 24 ? { $oid: targetId } : targetId }
    });

    const updatedRes = await this.client.execute<{ document: Person }>('findOne', 'persons', {
      filter: { _id: primaryId.length === 24 ? { $oid: primaryId } : primaryId }
    });
    return updatedRes?.document || null;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
