import { Env, Transaction, Person, Account } from './types';

/**
 * Lightweight, zero-dependency MongoDB Client for Cloudflare Workers.
 */
export class MongoDBClient {
  private apiKey: string;
  private appId: string;
  private databaseName: string;
  private dataSource: string;
  private baseUrl: string;
  private isConfigured: boolean;

  constructor(env: Env) {
    const rawKey = env.MONGODB_DATA_API_KEY || '';
    const rawUri = env.MONGODB_URI || '';

    this.apiKey = rawKey;
    this.appId = env.MONGODB_APP_ID || '';
    this.databaseName = env.MONGODB_DATABASE || 'finance_db';
    this.dataSource = env.MONGODB_DATA_SOURCE || 'main';
    
    this.baseUrl = `https://data.mongodb-api.com/app/${this.appId}/endpoint/data/v1`;
    this.isConfigured = Boolean((rawKey && !rawKey.startsWith('mongodb')) || rawUri);
  }

  private async requestDataApi(action: string, collection: string, payload: Record<string, any>): Promise<any> {
    if (!this.apiKey || this.apiKey.startsWith('mongodb')) {
      return null;
    }

    const url = `${this.baseUrl}/action/${action}`;
    const body = {
      dataSource: this.dataSource,
      database: this.databaseName,
      collection,
      ...payload
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Request-Headers': '*',
          'api-key': this.apiKey
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[MongoDB Data API Error] ${action} on ${collection} failed:`, errText);
        return null;
      }

      return await response.json();
    } catch (err: any) {
      console.error(`[MongoDB Data API Exception] ${action}:`, err.message || err);
      return null;
    }
  }

  // --- Transactions ---
  async createTransaction(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    const doc = {
      ...tx,
      createdAt: new Date().toISOString()
    };

    if (this.isConfigured) {
      const res = await this.requestDataApi('insertOne', 'transactions', { document: doc });
      return res?.insertedId || 'tx_' + Date.now();
    }

    return 'mock_tx_' + Date.now();
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('findOne', 'transactions', { filter: { _id: { $oid: id } } });
      return res?.document || null;
    }
    return null;
  }

  async updateTransaction(id: string, update: Partial<Transaction>): Promise<boolean> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('updateOne', 'transactions', {
        filter: { _id: { $oid: id } },
        update: { $set: update }
      });
      return (res?.matchedCount || 0) > 0;
    }
    return true;
  }

  async getLastConfirmedTransaction(): Promise<Transaction | null> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'transactions', {
        filter: { status: 'confirmed' },
        sort: { timestamp: -1 },
        limit: 1
      });
      return res?.documents?.[0] || null;
    }
    const recent = getMockTransactions();
    return recent[0] || null;
  }

  async getRecentTransactions(limit = 20): Promise<Transaction[]> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'transactions', {
        sort: { timestamp: -1 },
        limit
      });
      return res?.documents || [];
    }
    return getMockTransactions();
  }

  async getMonthlyStats(monthIsoPrefix: string): Promise<{ totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> }> {
    if (this.isConfigured) {
      const pipeline = [
        { $match: { status: 'confirmed', timestamp: { $regex: `^${monthIsoPrefix}` } } },
        { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' } } }
      ];
      const res = await this.requestDataApi('aggregate', 'transactions', { pipeline });
      return parseAggStats(res?.documents || []);
    }
    return getMockStats();
  }

  // --- Persons ---
  async getAllPersons(): Promise<Person[]> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'persons', { sort: { name: 1 } });
      return res?.documents || [];
    }
    return getMockPersons();
  }

  async findPersonByNameOrAlias(name: string): Promise<Person | null> {
    const esc = escapeRegex(name);
    if (this.isConfigured) {
      const res = await this.requestDataApi('findOne', 'persons', {
        filter: {
          $or: [
            { name: { $regex: `^${esc}$`, $options: 'i' } },
            { aliases: { $elemMatch: { $regex: `^${esc}$`, $options: 'i' } } }
          ]
        }
      });
      return res?.document || null;
    }

    const mock = getMockPersons().find(p => 
      p.name.toLowerCase() === name.toLowerCase() || 
      p.aliases.some(a => a.toLowerCase() === name.toLowerCase())
    );
    return mock || null;
  }

  async createPerson(name: string, initialAccount?: string): Promise<Person> {
    const newPerson: Person = {
      name,
      aliases: [name],
      accounts: initialAccount ? [initialAccount] : ['Default'],
      netBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.isConfigured) {
      const res = await this.requestDataApi('insertOne', 'persons', { document: newPerson });
      return { ...newPerson, _id: res?.insertedId };
    }

    return { ...newPerson, _id: 'person_' + Date.now() };
  }

  async updatePersonBalance(personId: string, amountDelta: number): Promise<void> {
    if (this.isConfigured) {
      await this.requestDataApi('updateOne', 'persons', {
        filter: { _id: { $oid: personId } },
        update: { $inc: { netBalance: amountDelta }, $set: { updatedAt: new Date().toISOString() } }
      });
    }
  }

  async mergePersons(primaryId: string, targetId: string, aliasToAdd: string): Promise<void> {
    if (this.isConfigured) {
      const targetRes = await this.requestDataApi('findOne', 'persons', { filter: { _id: { $oid: targetId } } });
      const target = targetRes?.document;
      if (target) {
        await this.requestDataApi('updateOne', 'persons', {
          filter: { _id: { $oid: primaryId } },
          update: {
            $inc: { netBalance: target.netBalance || 0 },
            $addToSet: { aliases: { $each: [...(target.aliases || []), aliasToAdd] }, accounts: { $each: target.accounts || [] } },
            $set: { updatedAt: new Date().toISOString() }
          }
        });
        await this.requestDataApi('updateMany', 'transactions', { filter: { personId: targetId }, update: { $set: { personId: primaryId } } });
        await this.requestDataApi('deleteOne', 'persons', { filter: { _id: { $oid: targetId } } });
      }
    }
  }

  // --- Accounts ---
  async getAllAccounts(): Promise<Account[]> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'accounts', { sort: { name: 1 } });
      return res?.documents || [];
    }
    return getMockAccounts();
  }

  async setAccountBalance(accountName: string, newBalance: number): Promise<void> {
    if (this.isConfigured) {
      await this.requestDataApi('updateOne', 'accounts', {
        filter: { name: accountName },
        update: {
          $set: { balance: newBalance, updatedAt: new Date().toISOString() },
          $setOnInsert: { type: detectAccountType(accountName), currency: 'PKR' }
        },
        upsert: true
      });
    }
  }

  async updateAccountBalance(accountName: string, delta: number): Promise<void> {
    if (this.isConfigured) {
      await this.requestDataApi('updateOne', 'accounts', {
        filter: { name: accountName },
        update: {
          $inc: { balance: delta },
          $setOnInsert: { type: detectAccountType(accountName), currency: 'PKR' },
          $set: { updatedAt: new Date().toISOString() }
        },
        upsert: true
      });
    }
  }

  // --- Group Expenses ---
  private buildGroupIdFilter(groupId: string | number) {
    const strVal = String(groupId);
    const numVal = Number(groupId);
    if (!isNaN(numVal)) {
      return { $or: [{ groupId: strVal }, { groupId: numVal }] };
    }
    return { groupId: strVal };
  }

  async createGroupExpense(exp: any): Promise<string> {
    const doc = { ...exp, createdAt: new Date().toISOString() };
    if (this.isConfigured) {
      const res = await this.requestDataApi('insertOne', 'group_expenses', { document: doc });
      return res?.insertedId || doc._id || 'gexp_' + Date.now();
    }
    return doc._id || 'gexp_' + Date.now();
  }

  async getGroupExpensesByGroupId(groupId: string | number): Promise<any[]> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'group_expenses', {
        filter: this.buildGroupIdFilter(groupId),
        sort: { timestamp: -1 }
      });
      return res?.documents || [];
    }
    return [];
  }

  async updateGroupExpense(id: string, update: Record<string, any>): Promise<boolean> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('updateOne', 'group_expenses', {
        filter: { _id: id.length === 24 ? { $oid: id } : id },
        update: { $set: update }
      });
      return (res?.matchedCount || 0) > 0;
    }
    return true;
  }

  async deleteGroupExpense(id: string): Promise<boolean> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('deleteOne', 'group_expenses', {
        filter: { _id: id.length === 24 ? { $oid: id } : id }
      });
      return (res?.deletedCount || 0) > 0;
    }
    return true;
  }

  async getLastGroupExpense(groupId: string | number): Promise<any | null> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'group_expenses', {
        filter: this.buildGroupIdFilter(groupId),
        sort: { timestamp: -1 },
        limit: 1
      });
      return res?.documents?.[0] || null;
    }
    return null;
  }

  // --- Group Audit Logs ---
  async createGroupAuditLog(audit: any): Promise<string> {
    const doc = { ...audit, createdAt: new Date().toISOString() };
    if (this.isConfigured) {
      const res = await this.requestDataApi('insertOne', 'group_audit_logs', { document: doc });
      return res?.insertedId || doc._id || 'audit_' + Date.now();
    }
    return doc._id || 'audit_' + Date.now();
  }

  async getGroupAuditLogsByGroupId(groupId: string | number, limit = 20): Promise<any[]> {
    if (this.isConfigured) {
      const res = await this.requestDataApi('find', 'group_audit_logs', {
        filter: this.buildGroupIdFilter(groupId),
        sort: { timestamp: -1 },
        limit
      });
      return res?.documents || [];
    }
    return [];
  }
}

/**
 * Isolated MongoDB Client for Group Bot.
 * STRICT PRIVACY GUARANTEE: Does NOT expose personal transactions, account balances, or personal counterparties.
 */
export class GroupMongoDBClient {
  private client: MongoDBClient;

  constructor(env: Env) {
    this.client = new MongoDBClient(env);
  }

  async createGroupExpense(exp: any): Promise<string> {
    return await this.client.createGroupExpense(exp);
  }

  async getGroupExpensesByGroupId(groupId: string | number): Promise<any[]> {
    return await this.client.getGroupExpensesByGroupId(groupId);
  }

  async updateGroupExpense(id: string, update: Record<string, any>): Promise<boolean> {
    return await this.client.updateGroupExpense(id, update);
  }

  async deleteGroupExpense(id: string): Promise<boolean> {
    return await this.client.deleteGroupExpense(id);
  }

  async getLastGroupExpense(groupId: string | number): Promise<any | null> {
    return await this.client.getLastGroupExpense(groupId);
  }

  async createGroupAuditLog(audit: any): Promise<string> {
    return await this.client.createGroupAuditLog(audit);
  }

  async getGroupAuditLogsByGroupId(groupId: string | number, limit = 20): Promise<any[]> {
    return await this.client.getGroupAuditLogsByGroupId(groupId, limit);
  }
}

function parseAggStats(docs: any[]) {
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const doc of docs) {
    const type = doc._id?.type;
    const cat = doc._id?.category || 'General';
    const sum = doc.total || 0;

    if (type === 'income') totalIncome += sum;
    if (type === 'expense') {
      totalExpense += sum;
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + sum;
    }
  }

  return { totalIncome, totalExpense, categoryBreakdown };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectAccountType(name: string): 'mobile_wallet' | 'bank' | 'cash' | 'card' {
  const n = name.toLowerCase();
  if (n.includes('jazzcash') || n.includes('easypaisa') || n.includes('nayapay') || n.includes('sadapay')) {
    return 'mobile_wallet';
  }
  if (n.includes('bank') || n.includes('meezan') || n.includes('hbl') || n.includes('ubl') || n.includes('alfalah')) {
    return 'bank';
  }
  if (n.includes('cash')) return 'cash';
  return 'card';
}

function getMockTransactions(): Transaction[] {
  return [
    { _id: 'tx_1', type: 'expense', amount: 1450, currency: 'PKR', category: 'Food & Dining', account: 'JazzCash', personName: 'Tehzeeb Bakery', note: 'Fresh bread & cakes', rawText: 'Spent 1450 at Tehzeeb via JazzCash', status: 'confirmed', timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
    { _id: 'tx_2', type: 'transfer', amount: 5000, currency: 'PKR', category: 'Friends & Debt', account: 'Meezan Bank', personName: 'Ali Khan', note: 'Dinner split transfer', rawText: 'Sent 5000 to Ali Khan via Meezan', status: 'confirmed', timestamp: new Date(Date.now() - 3600000 * 24).toISOString() },
    { _id: 'tx_3', type: 'income', amount: 45000, currency: 'PKR', category: 'Freelance / Salary', account: 'EasyPaisa', personName: 'Client Payment', note: 'Website design milestone', rawText: 'Recieved 45000 on EasyPaisa', status: 'confirmed', timestamp: new Date(Date.now() - 3600000 * 48).toISOString() }
  ];
}

function getMockPersons(): Person[] {
  return [
    { _id: 'p_1', name: 'Ali Khan', aliases: ['Ali', 'Ali K', 'Ali Khan'], accounts: ['JazzCash', 'Meezan Bank'], netBalance: 5000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { _id: 'p_2', name: 'Usman Ahmed', aliases: ['Usman', 'Usman A'], accounts: ['EasyPaisa', 'HBL'], netBalance: -2500, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ];
}

function getMockAccounts(): Account[] {
  return [
    { _id: 'acc_1', name: 'JazzCash', type: 'mobile_wallet', balance: 18450, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_2', name: 'EasyPaisa', type: 'mobile_wallet', balance: 32000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_3', name: 'Meezan Bank', type: 'bank', balance: 125000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_4', name: 'NayaPay', type: 'mobile_wallet', balance: 6500, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_5', name: 'Cash', type: 'cash', balance: 4200, currency: 'PKR', updatedAt: new Date().toISOString() }
  ];
}

function getMockStats() {
  return {
    totalIncome: 45000,
    totalExpense: 1450,
    categoryBreakdown: { 'Food & Dining': 1450, 'Bills & Utilities': 3200, 'Groceries': 8500 }
  };
}
