import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { Kameti } from '../types';

export class KametiRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  private mapRowToKameti(r: any): Kameti {
    return {
      _id: r.id,
      name: r.name,
      monthlyAmount: Number(r.monthlyAmount) || 0,
      totalMonths: Number(r.totalMonths) || 1,
      currentMonth: Number(r.currentMonth) || 1,
      startDate: r.startDate || new Date().toISOString(),
      status: r.status || 'active',
      members: typeof r.members === 'string' ? JSON.parse(r.members) : r.members || [],
      createdAt: r.createdAt || new Date().toISOString()
    };
  }

  async getAll(): Promise<Kameti[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM kametis ORDER BY "createdAt" DESC');
      return rows.map(r => this.mapRowToKameti(r));
    }
    return this.mockStore.getKametis();
  }

  async getById(id: string): Promise<Kameti | null> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM kametis WHERE id = $1 LIMIT 1', [id]);
      if (rows.length === 0) return null;
      return this.mapRowToKameti(rows[0]);
    }
    return this.mockStore.getKametiById(id);
  }

  async getByName(name: string): Promise<Kameti | null> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM kametis WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
      if (rows.length === 0) return null;
      return this.mapRowToKameti(rows[0]);
    }
    return this.mockStore.getKametiByName(name);
  }

  async create(data: Omit<Kameti, '_id' | 'createdAt'>): Promise<Kameti> {
    const id = `kameti_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const kameti: Kameti = {
      _id: id,
      ...data,
      createdAt
    };

    if (this.neon.isConfigured) {
      await this.neon.query(
        `INSERT INTO kametis (id, name, "monthlyAmount", "totalMonths", "currentMonth", "startDate", status, members, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          data.name,
          data.monthlyAmount,
          data.totalMonths,
          data.currentMonth || 1,
          data.startDate || createdAt,
          data.status || 'active',
          JSON.stringify(data.members || []),
          createdAt
        ]
      );
      return kameti;
    }
    return this.mockStore.createKameti(data);
  }

  async markPaid(kametiIdOrName: string, memberName: string, month?: number): Promise<boolean> {
    const kameti = (await this.getByName(kametiIdOrName)) || (await this.getById(kametiIdOrName));
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

    if (this.neon.isConfigured) {
      await this.neon.query('UPDATE kametis SET members = $1 WHERE id = $2', [JSON.stringify(kameti.members), kameti._id]);
      return true;
    }
    return this.mockStore.updateKametiMembers(kameti._id!, kameti.members);
  }

  async markPayoutReceived(kametiIdOrName: string, memberName: string): Promise<boolean> {
    const kameti = (await this.getByName(kametiIdOrName)) || (await this.getById(kametiIdOrName));
    if (!kameti) return false;

    const memberIndex = kameti.members.findIndex(
      m => m.name.toLowerCase() === memberName.toLowerCase()
    );
    if (memberIndex === -1) return false;

    kameti.members[memberIndex].payoutReceived = true;

    if (this.neon.isConfigured) {
      await this.neon.query('UPDATE kametis SET members = $1 WHERE id = $2', [JSON.stringify(kameti.members), kameti._id]);
      return true;
    }
    return this.mockStore.updateKametiMembers(kameti._id!, kameti.members);
  }

  async advanceMonth(kametiIdOrName: string): Promise<number | null> {
    const kameti = (await this.getByName(kametiIdOrName)) || (await this.getById(kametiIdOrName));
    if (!kameti) return null;

    if (this.neon.isConfigured) {
      if (kameti.currentMonth >= kameti.totalMonths) {
        kameti.status = 'completed';
      } else {
        kameti.currentMonth += 1;
      }
      await this.neon.query('UPDATE kametis SET "currentMonth" = $1, status = $2 WHERE id = $3', [
        kameti.currentMonth,
        kameti.status,
        kameti._id
      ]);
      return kameti.currentMonth;
    }
    return this.mockStore.advanceKametiMonth(kameti._id!);
  }
}
