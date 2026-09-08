import { NeonPostgresClient } from '../neonClient';
import { InMemoryMockStore } from '../mockStore';
import { Person } from '../types';

export class PersonRepository {
  constructor(
    private neon: NeonPostgresClient,
    private mockStore: InMemoryMockStore
  ) {}

  private mapRowToPerson(r: any): Person {
    return {
      _id: r.id,
      name: r.name,
      aliases: Array.isArray(r.aliases) ? r.aliases : typeof r.aliases === 'string' ? JSON.parse(r.aliases) : [],
      accounts: Array.isArray(r.accounts) ? r.accounts : typeof r.accounts === 'string' ? JSON.parse(r.accounts) : [],
      netBalance: Number(r.netBalance) || 0,
      notes: r.notes || undefined,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString()
    };
  }

  async getAll(): Promise<Person[]> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT * FROM persons ORDER BY name ASC');
      return rows.map(r => this.mapRowToPerson(r));
    }
    return this.mockStore.getAllPersons();
  }

  async findByNameOrAlias(name: string): Promise<Person | null> {
    if (this.neon.isConfigured) {
      const trimmed = name.trim().toLowerCase();
      const all = await this.getAll();
      for (const p of all) {
        if (p.name.toLowerCase() === trimmed) return p;
        if (p.aliases.some(a => a.toLowerCase() === trimmed)) return p;
      }
      return null;
    }
    return this.mockStore.findPersonByNameOrAlias(name);
  }

  async create(name: string, initialAccount?: string): Promise<Person> {
    if (this.neon.isConfigured) {
      const id = `person_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const aliases = [name];
      const accounts = initialAccount ? [initialAccount] : ['Default'];

      await this.neon.query(
        `INSERT INTO persons (id, name, aliases, accounts, "netBalance", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 0, $5, $5)
         ON CONFLICT (name) DO NOTHING`,
        [id, name, JSON.stringify(aliases), JSON.stringify(accounts), now]
      );

      const existing = await this.findByNameOrAlias(name);
      if (existing) return existing;

      return {
        _id: id,
        name,
        aliases,
        accounts,
        netBalance: 0,
        createdAt: now,
        updatedAt: now
      };
    }
    return this.mockStore.createPerson(name, initialAccount);
  }

  async updateBalance(personId: string, delta: number): Promise<void> {
    if (this.neon.isConfigured) {
      const now = new Date().toISOString();
      await this.neon.query(
        `UPDATE persons SET "netBalance" = "netBalance" + $1, "updatedAt" = $2 WHERE id = $3`,
        [delta, now, personId]
      );
      return;
    }
    await this.mockStore.updatePersonBalance(personId, delta);
  }

  async addAlias(personId: string, alias: string): Promise<void> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT aliases FROM persons WHERE id = $1', [personId]);
      if (rows.length > 0) {
        let currentAliases: string[] = Array.isArray(rows[0].aliases)
          ? rows[0].aliases
          : typeof rows[0].aliases === 'string'
          ? JSON.parse(rows[0].aliases)
          : [];
        if (!currentAliases.includes(alias)) {
          currentAliases.push(alias);
          await this.neon.query(
            'UPDATE persons SET aliases = $1, "updatedAt" = $2 WHERE id = $3',
            [JSON.stringify(currentAliases), new Date().toISOString(), personId]
          );
        }
      }
      return;
    }
    await this.mockStore.addPersonAlias(personId, alias);
  }

  async addAccount(personId: string, accountName: string): Promise<void> {
    if (this.neon.isConfigured) {
      const rows = await this.neon.query<any>('SELECT accounts FROM persons WHERE id = $1', [personId]);
      if (rows.length > 0) {
        let currentAccounts: string[] = Array.isArray(rows[0].accounts)
          ? rows[0].accounts
          : typeof rows[0].accounts === 'string'
          ? JSON.parse(rows[0].accounts)
          : [];
        if (!currentAccounts.includes(accountName)) {
          currentAccounts.push(accountName);
          await this.neon.query(
            'UPDATE persons SET accounts = $1, "updatedAt" = $2 WHERE id = $3',
            [JSON.stringify(currentAccounts), new Date().toISOString(), personId]
          );
        }
      }
      return;
    }
  }

  async getDebtSummary(): Promise<{ owedToMe: Person[]; iOwe: Person[] }> {
    const all = await this.getAll();
    return {
      owedToMe: all.filter(p => p.netBalance > 0),
      iOwe: all.filter(p => p.netBalance < 0)
    };
  }

  async merge(primaryId: string, targetId: string, aliasToAdd?: string): Promise<Person | null> {
    if (this.neon.isConfigured) {
      const targetRows = await this.neon.query<any>('SELECT * FROM persons WHERE id = $1', [targetId]);
      if (targetRows.length === 0) return null;

      const target = this.mapRowToPerson(targetRows[0]);
      const primaryRows = await this.neon.query<any>('SELECT * FROM persons WHERE id = $1', [primaryId]);
      if (primaryRows.length === 0) return null;

      const primary = this.mapRowToPerson(primaryRows[0]);

      const newAliases = Array.from(new Set([...primary.aliases, target.name, ...target.aliases, ...(aliasToAdd ? [aliasToAdd] : [])]));
      const newNetBalance = primary.netBalance + target.netBalance;

      await this.neon.query(
        'UPDATE persons SET aliases = $1, "netBalance" = $2, "updatedAt" = $3 WHERE id = $4',
        [JSON.stringify(newAliases), newNetBalance, new Date().toISOString(), primaryId]
      );

      await this.neon.query('UPDATE transactions SET "personId" = $1 WHERE "personId" = $2', [primaryId, targetId]);
      await this.neon.query('DELETE FROM persons WHERE id = $1', [targetId]);

      const updated = await this.neon.query<any>('SELECT * FROM persons WHERE id = $1', [primaryId]);
      return updated.length > 0 ? this.mapRowToPerson(updated[0]) : null;
    }
    return this.mockStore.mergePersons(primaryId, targetId, aliasToAdd || targetId);
  }
}
