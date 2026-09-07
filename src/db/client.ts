import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { Env } from './types';
import { getUtcTimestamp } from '../utils/timezone';

const TABLE_MAP: Record<string, string> = {
  budget_caps: 'budgets',
  group_expenses: 'group_expenses',
  group_audit_logs: 'group_audit_logs',
  accounts: 'accounts',
  transactions: 'transactions',
  persons: 'persons',
  goals: 'goals',
  reminders: 'reminders',
  kametis: 'kametis',
  whitelist: 'whitelist'
};

const JSON_FIELDS = new Set(['splits', 'data', 'members']);

let cachedSql: NeonQueryFunction<any, any> | null = null;
let cachedUri: string | null = null;

/**
 * Universal Database Client for Cloudflare Workers & Neon PostgreSQL.
 * Provides drop-in execute() compatibility while querying Neon over HTTPS (port 443).
 * Enforces strict UTC on all stored timestamps.
 */
export class MongoDBAtlasClient {
  private sql: NeonQueryFunction<any, any>;
  public readonly isConfigured: boolean;
  public lastError: string | null = null;

  constructor(env: Env) {
    const connectionString = env.DATABASE_URL || env.MONGODB_URI || '';
    this.isConfigured = Boolean(connectionString && connectionString.startsWith('postgres'));

    if (this.isConfigured) {
      if (!cachedSql || cachedUri !== connectionString) {
        cachedSql = neon(connectionString);
        cachedUri = connectionString;
      }
      this.sql = cachedSql;
    } else {
      this.sql = neon('postgresql://unconfigured@localhost/db');
      this.lastError = 'DATABASE_URL not configured. Please set your Neon PostgreSQL connection string.';
    }
  }

  private quoteCol(col: string): string {
    if (col === '_id') return 'id';
    return /[A-Z]/.test(col) ? `"${col}"` : col;
  }

  private formatDoc(doc: any): any {
    if (!doc || typeof doc !== 'object') return doc;
    const formatted = { ...doc };
    if (formatted.id && !formatted._id) {
      formatted._id = String(formatted.id);
    }
    // Parse JSON fields if returned as strings
    for (const field of JSON_FIELDS) {
      if (typeof formatted[field] === 'string') {
        try {
          formatted[field] = JSON.parse(formatted[field]);
        } catch {
          // Keep as string
        }
      }
    }
    return formatted;
  }

  private buildWhereClause(filter: Record<string, any>, params: any[]): string {
    if (!filter || Object.keys(filter).length === 0) return '';
    const clauses: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$or' && Array.isArray(value)) {
        const orClauses = value.map(subFilter => this.buildWhereClause(subFilter, params)).filter(Boolean);
        if (orClauses.length > 0) {
          clauses.push(`(${orClauses.join(' OR ')})`);
        }
      } else if (key === '_id') {
        const idVal = typeof value === 'object' && value !== null && '$oid' in value ? value.$oid : value;
        params.push(String(idVal));
        clauses.push(`id = $${params.length}`);
      } else if (typeof value === 'object' && value !== null) {
        if ('$regex' in value) {
          const rxStr = String(value.$regex).replace(/^\^/, '').replace(/\$$/, '');
          params.push(rxStr);
          clauses.push(`${this.quoteCol(key)} ILIKE $${params.length}`);
        } else if ('$elemMatch' in value && typeof value.$elemMatch === 'object' && '$regex' in value.$elemMatch) {
          const rxStr = String(value.$elemMatch.$regex).replace(/^\^/, '').replace(/\$$/, '');
          params.push(rxStr);
          clauses.push(`EXISTS (SELECT 1 FROM unnest(${this.quoteCol(key)}) x WHERE x ILIKE $${params.length})`);
        } else {
          params.push(JSON.stringify(value));
          clauses.push(`${this.quoteCol(key)} = $${params.length}`);
        }
      } else {
        params.push(value);
        clauses.push(`${this.quoteCol(key)} = $${params.length}`);
      }
    }

    return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  }

  private async rawQuery(query: string, params: any[] = []): Promise<any[]> {
    return (await (this.sql as any).query(query, params)) as any[];
  }

  async execute<T = any>(action: string, collectionName: string, payload: Record<string, any> = {}): Promise<T | null> {
    if (!this.isConfigured) {
      this.lastError = 'DATABASE_URL not configured. Please set in secrets.';
      return null;
    }

    const table = TABLE_MAP[collectionName] || collectionName;

    try {
      this.lastError = null;

      switch (action) {
        case 'insertOne': {
          const doc = { ...payload.document };
          delete doc._id;
          if (!doc.createdAt && table !== 'accounts') {
            doc.createdAt = getUtcTimestamp();
          }

          const cols: string[] = [];
          const placeholders: string[] = [];
          const vals: any[] = [];

          for (const [k, v] of Object.entries(doc)) {
            cols.push(this.quoteCol(k));
            vals.push(JSON_FIELDS.has(k) && typeof v === 'object' ? JSON.stringify(v) : v);
            placeholders.push(`$${vals.length}`);
          }

          const query = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;
          const rows = await this.rawQuery(query, vals);
          const insertedId = rows?.[0]?.id ? String(rows[0].id) : 'id_' + Date.now();
          return { insertedId } as T;
        }

        case 'insertMany': {
          const docs: any[] = payload.documents || [];
          const insertedIds: string[] = [];
          for (const doc of docs) {
            const res = await this.execute<{ insertedId: string }>('insertOne', collectionName, { document: doc });
            if (res?.insertedId) insertedIds.push(res.insertedId);
          }
          return { insertedIds } as T;
        }

        case 'findOne': {
          const params: any[] = [];
          const where = this.buildWhereClause(payload.filter, params);
          const query = `SELECT * FROM ${table} ${where} LIMIT 1`;
          const rows = await this.rawQuery(query, params);
          const doc = rows?.[0] ? this.formatDoc(rows[0]) : null;
          return { document: doc } as T;
        }

        case 'find': {
          const params: any[] = [];
          const where = this.buildWhereClause(payload.filter, params);
          let orderBy = '';
          if (payload.sort) {
            const sortParts: string[] = [];
            for (const [k, dir] of Object.entries(payload.sort)) {
              sortParts.push(`${this.quoteCol(k)} ${Number(dir) >= 0 ? 'ASC' : 'DESC'}`);
            }
            if (sortParts.length > 0) orderBy = `ORDER BY ${sortParts.join(', ')}`;
          }

          let limitClause = '';
          if (payload.limit) {
            limitClause = `LIMIT ${Number(payload.limit)}`;
          }

          const query = `SELECT * FROM ${table} ${where} ${orderBy} ${limitClause}`;
          const rows = await this.rawQuery(query, params);
          const docs = (rows || []).map((r: any) => this.formatDoc(r));
          return { documents: docs } as T;
        }

        case 'updateOne': {
          const filterParams: any[] = [];
          const where = this.buildWhereClause(payload.filter, filterParams);

          // Check if record exists
          const existing = await this.rawQuery(`SELECT id FROM ${table} ${where} LIMIT 1`, filterParams);

          if (existing && existing.length > 0) {
            const id = existing[0].id;
            const setStatements: string[] = [];
            const updateParams: any[] = [];

            if (payload.update?.$set) {
              for (const [k, v] of Object.entries(payload.update.$set)) {
                if (k === '_id' || k === 'id') continue;
                updateParams.push(JSON_FIELDS.has(k) && typeof v === 'object' ? JSON.stringify(v) : v);
                setStatements.push(`${this.quoteCol(k)} = $${updateParams.length}`);
              }
            }

            if (payload.update?.$inc) {
              for (const [k, v] of Object.entries(payload.update.$inc)) {
                updateParams.push(Number(v));
                setStatements.push(`${this.quoteCol(k)} = COALESCE(${this.quoteCol(k)}, 0) + $${updateParams.length}`);
              }
            }

            if (payload.update?.$addToSet) {
              for (const [k, v] of Object.entries(payload.update.$addToSet)) {
                if (typeof v === 'object' && v !== null && '$each' in (v as any)) {
                  const arr = (v as any).$each;
                  updateParams.push(arr);
                  setStatements.push(`${this.quoteCol(k)} = array_cat(${this.quoteCol(k)}, $${updateParams.length})`);
                } else {
                  updateParams.push(v);
                  setStatements.push(`${this.quoteCol(k)} = array_append(${this.quoteCol(k)}, $${updateParams.length})`);
                }
              }
            }

            if (setStatements.length > 0) {
              updateParams.push(id);
              const updateSql = `UPDATE ${table} SET ${setStatements.join(', ')} WHERE id = $${updateParams.length} RETURNING id`;
              const res = await this.rawQuery(updateSql, updateParams);
              return { matchedCount: 1, modifiedCount: res.length } as T;
            }
            return { matchedCount: 1, modifiedCount: 0 } as T;
          } else if (payload.upsert) {
            // Upsert: Create new record
            const newDoc: Record<string, any> = {
              ...(payload.filter || {}),
              ...(payload.update?.$set || {}),
              ...(payload.update?.$setOnInsert || {})
            };
            delete newDoc._id;
            delete newDoc.id;

            const cols: string[] = [];
            const placeholders: string[] = [];
            const vals: any[] = [];

            for (const [k, v] of Object.entries(newDoc)) {
              cols.push(this.quoteCol(k));
              vals.push(JSON_FIELDS.has(k) && typeof v === 'object' ? JSON.stringify(v) : v);
              placeholders.push(`$${vals.length}`);
            }

            const insertSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;
            const insRes = await this.rawQuery(insertSql, vals);
            const upsertedId = insRes?.[0]?.id ? String(insRes[0].id) : undefined;
            return { matchedCount: 0, modifiedCount: 0, upsertedId } as T;
          }

          return { matchedCount: 0, modifiedCount: 0 } as T;
        }

        case 'updateMany': {
          const params: any[] = [];
          const where = this.buildWhereClause(payload.filter, params);
          const setStatements: string[] = [];

          if (payload.update?.$set) {
            for (const [k, v] of Object.entries(payload.update.$set)) {
              if (k === '_id' || k === 'id') continue;
              params.push(JSON_FIELDS.has(k) && typeof v === 'object' ? JSON.stringify(v) : v);
              setStatements.push(`${this.quoteCol(k)} = $${params.length}`);
            }
          }

          if (setStatements.length > 0) {
            const query = `UPDATE ${table} SET ${setStatements.join(', ')} ${where} RETURNING id`;
            const res = await this.rawQuery(query, params);
            return { matchedCount: res.length, modifiedCount: res.length } as T;
          }
          return { matchedCount: 0, modifiedCount: 0 } as T;
        }

        case 'deleteOne': {
          const params: any[] = [];
          const where = this.buildWhereClause(payload.filter, params);
          const query = `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} ${where} LIMIT 1) RETURNING id`;
          const res = await this.rawQuery(query, params);
          return { deletedCount: res.length } as T;
        }

        case 'deleteMany': {
          const params: any[] = [];
          const where = this.buildWhereClause(payload.filter, params);
          const query = `DELETE FROM ${table} ${where} RETURNING id`;
          const res = await this.rawQuery(query, params);
          return { deletedCount: res.length } as T;
        }

        default:
          throw new Error(`Unsupported action "${action}" on ${table}`);
      }
    } catch (err: any) {
      console.error(`[Neon PostgreSQL Exception] ${action} on ${collectionName}:`, err?.message || err);
      this.lastError = err?.message || String(err);
      return null;
    }
  }
}
