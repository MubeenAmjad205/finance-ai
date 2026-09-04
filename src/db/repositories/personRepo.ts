import { MongoDBAtlasClient } from '../client';
import { InMemoryMockStore } from '../mockStore';
import { Person } from '../types';

export class PersonRepository {
  constructor(private client: MongoDBAtlasClient, private mockStore: InMemoryMockStore) {}

  async getAll(): Promise<Person[]> {
    if (this.client.isConfigured) {
      const res = await this.client.execute<{ documents: Person[] }>('find', 'persons', {
        sort: { name: 1 }
      });
      return res?.documents || [];
    }
    return [...this.mockStore.persons].sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByNameOrAlias(name: string): Promise<Person | null> {
    const trimmed = name.trim();
    const esc = this.escapeRegex(trimmed);

    if (this.client.isConfigured) {
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

    const lower = trimmed.toLowerCase();
    const found = this.mockStore.persons.find(
      p => p.name.toLowerCase() === lower || p.aliases.some(a => a.toLowerCase() === lower)
    );
    return found || null;
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

    if (this.client.isConfigured) {
      const res = await this.client.execute<{ insertedId: string }>('insertOne', 'persons', {
        document: newPerson
      });
      return { ...newPerson, _id: res?.insertedId };
    }

    const mockPerson: Person = { ...newPerson, _id: 'person_' + Date.now() };
    this.mockStore.persons.push(mockPerson);
    return mockPerson;
  }

  async updateBalance(personId: string, amountDelta: number): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'persons', {
        filter: { _id: { $oid: personId } },
        update: {
          $inc: { netBalance: amountDelta },
          $set: { updatedAt: new Date().toISOString() }
        }
      });
      return;
    }

    const p = this.mockStore.persons.find(item => item._id === personId);
    if (p) {
      p.netBalance += amountDelta;
      p.updatedAt = new Date().toISOString();
    }
  }

  async addAlias(personId: string, alias: string): Promise<void> {
    if (this.client.isConfigured) {
      await this.client.execute('updateOne', 'persons', {
        filter: { _id: { $oid: personId } },
        update: {
          $addToSet: { aliases: alias },
          $set: { updatedAt: new Date().toISOString() }
        }
      });
      return;
    }

    const p = this.mockStore.persons.find(item => item._id === personId);
    if (p && !p.aliases.includes(alias)) {
      p.aliases.push(alias);
      p.updatedAt = new Date().toISOString();
    }
  }

  async merge(primaryId: string, targetId: string, aliasToAdd: string): Promise<void> {
    if (this.client.isConfigured) {
      const targetRes = await this.client.execute<{ document: Person }>('findOne', 'persons', {
        filter: { _id: { $oid: targetId } }
      });
      const target = targetRes?.document;

      if (target) {
        const updateOps: any = {
          $inc: { netBalance: target.netBalance || 0 },
          $addToSet: { aliases: { $each: [...(target.aliases || []), aliasToAdd] } },
          $set: { updatedAt: new Date().toISOString() }
        };

        if (target.accounts && target.accounts.length > 0) {
          updateOps.$addToSet.accounts = { $each: target.accounts };
        }

        await this.client.execute('updateOne', 'persons', {
          filter: { _id: { $oid: primaryId } },
          update: updateOps
        });

        await this.client.execute('updateMany', 'transactions', {
          filter: { personId: targetId },
          update: { $set: { personId: primaryId } }
        });

        await this.client.execute('deleteOne', 'persons', {
          filter: { _id: { $oid: targetId } }
        });
      }
      return;
    }

    // In-memory mock merge
    const primary = this.mockStore.persons.find(p => p._id === primaryId);
    const targetIdx = this.mockStore.persons.findIndex(p => p._id === targetId);

    if (primary && targetIdx !== -1) {
      const target = this.mockStore.persons[targetIdx];
      primary.netBalance += target.netBalance;
      primary.aliases = Array.from(new Set([...primary.aliases, ...(target.aliases || []), aliasToAdd]));
      primary.accounts = Array.from(new Set([...primary.accounts, ...(target.accounts || [])]));
      primary.updatedAt = new Date().toISOString();

      // Update mock transactions
      for (const tx of this.mockStore.transactions) {
        if (tx.personId === targetId) {
          tx.personId = primaryId;
        }
      }

      // Remove target person
      this.mockStore.persons.splice(targetIdx, 1);
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
