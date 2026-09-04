import { Env, Transaction, Person, Account, MergeProposal } from './types';

/**
 * MongoDB Atlas Data API Client optimized for Cloudflare Workers (Fetch API).
 * Zero cold starts, lightweight, and fully serverless compatible.
 */
export class MongoDBClient {
  private apiKey: string;
  private appId: string;
  private database: string;
  private dataSource: string;
  private baseUrl: string;
  private isConfigured: boolean;

  constructor(env: Env) {
    this.apiKey = env.MONGODB_DATA_API_KEY || '';
    this.appId = env.MONGODB_APP_ID || '';
    this.database = env.MONGODB_DATABASE || 'finance_db';
    this.dataSource = env.MONGODB_DATA_SOURCE || 'Cluster0';
    
    // Default MongoDB Atlas Data API base URL pattern
    this.baseUrl = `https://services.cloud.mongodb.com/api/client/v2.0/app/${this.appId}/service/data/incoming_webhook`;
    // Standard Atlas Data API v1 format
    if (this.appId && !this.appId.startsWith('http')) {
      this.baseUrl = `https://data.mongodb-api.com/app/${this.appId}/endpoint/data/v1`;
    }
    
    this.isConfigured = Boolean(this.apiKey && this.appId);
  }

  private async request(action: string, collection: string, payload: Record<string, any>): Promise<any> {
    if (!this.isConfigured) {
      console.warn(`[MongoDB] Data API credentials missing. Action '${action}' on '${collection}' fallback.`);
      return null;
    }

    const url = `${this.baseUrl}/action/${action}`;
    const body = {
      dataSource: this.dataSource,
      database: this.database,
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
        console.error(`[MongoDB Error] ${action} on ${collection} failed (${response.status}):`, errText);
        throw new Error(`MongoDB Data API request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      console.error(`[MongoDB Fetch Exception] ${action} on ${collection}:`, err.message || err);
      throw err;
    }
  }

  // --- Transactions ---
  async createTransaction(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    const doc = {
      ...tx,
      createdAt: new Date().toISOString()
    };
    if (!this.isConfigured) return 'mock_tx_' + Date.now();

    const res = await this.request('insertOne', 'transactions', { document: doc });
    return res?.insertedId || 'tx_' + Date.now();
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    if (!this.isConfigured) return null;
    const res = await this.request('findOne', 'transactions', { filter: { _id: { $oid: id } } });
    return res?.document || null;
  }

  async updateTransaction(id: string, update: Partial<Transaction>): Promise<boolean> {
    if (!this.isConfigured) return true;
    const res = await this.request('updateOne', 'transactions', {
      filter: { _id: { $oid: id } },
      update: { $set: update }
    });
    return (res?.matchedCount || 0) > 0;
  }

  async getRecentTransactions(limit = 20): Promise<Transaction[]> {
    if (!this.isConfigured) return getMockTransactions();
    const res = await this.request('find', 'transactions', {
      sort: { timestamp: -1 },
      limit
    });
    return res?.documents || [];
  }

  async getMonthlyStats(monthIsoPrefix: string): Promise<{ totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> }> {
    if (!this.isConfigured) return getMockStats();
    
    // Aggregation pipeline to sum income vs expenses
    const pipeline = [
      {
        $match: {
          status: 'confirmed',
          timestamp: { $regex: `^${monthIsoPrefix}` }
        }
      },
      {
        $group: {
          _id: { type: '$type', category: '$category' },
          total: { $sum: '$amount' }
        }
      }
    ];

    const res = await this.request('aggregate', 'transactions', { pipeline });
    const docs = res?.documents || [];

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

  // --- Persons ---
  async getAllPersons(): Promise<Person[]> {
    if (!this.isConfigured) return getMockPersons();
    const res = await this.request('find', 'persons', { sort: { name: 1 } });
    return res?.documents || [];
  }

  async findPersonByNameOrAlias(name: string): Promise<Person | null> {
    if (!this.isConfigured) {
      const mock = getMockPersons().find(p => 
        p.name.toLowerCase() === name.toLowerCase() || 
        p.aliases.some(a => a.toLowerCase() === name.toLowerCase())
      );
      return mock || null;
    }

    const res = await this.request('findOne', 'persons', {
      filter: {
        $or: [
          { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
          { aliases: { $elemMatch: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } } }
        ]
      }
    });
    return res?.document || null;
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

    if (!this.isConfigured) return { ...newPerson, _id: 'person_' + Date.now() };

    const res = await this.request('insertOne', 'persons', { document: newPerson });
    return { ...newPerson, _id: res?.insertedId };
  }

  async updatePersonBalance(personId: string, amountDelta: number): Promise<void> {
    if (!this.isConfigured) return;
    await this.request('updateOne', 'persons', {
      filter: { _id: { $oid: personId } },
      update: {
        $inc: { netBalance: amountDelta },
        $set: { updatedAt: new Date().toISOString() }
      }
    });
  }

  async mergePersons(primaryId: string, targetId: string, aliasToAdd: string): Promise<void> {
    if (!this.isConfigured) return;

    // 1. Get target person data
    const targetRes = await this.request('findOne', 'persons', { filter: { _id: { $oid: targetId } } });
    const target = targetRes?.document as Person | undefined;

    if (!target) return;

    // 2. Transfer target balance and aliases to primary
    await this.request('updateOne', 'persons', {
      filter: { _id: { $oid: primaryId } },
      update: {
        $inc: { netBalance: target.netBalance || 0 },
        $addToSet: {
          aliases: { $each: [...(target.aliases || []), aliasToAdd] },
          accounts: { $each: target.accounts || [] }
        },
        $set: { updatedAt: new Date().toISOString() }
      }
    });

    // 3. Re-assign transactions from target to primary
    await this.request('updateMany', 'transactions', {
      filter: { personId: targetId },
      update: { $set: { personId: primaryId } }
    });

    // 4. Delete target person record
    await this.request('deleteOne', 'persons', { filter: { _id: { $oid: targetId } } });
  }

  // --- Accounts ---
  async getAllAccounts(): Promise<Account[]> {
    if (!this.isConfigured) return getMockAccounts();
    const res = await this.request('find', 'accounts', { sort: { name: 1 } });
    return res?.documents || [];
  }

  async updateAccountBalance(accountName: string, delta: number): Promise<void> {
    if (!this.isConfigured) return;
    // Upsert account balance
    await this.request('updateOne', 'accounts', {
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

// --- Mock Fallbacks for Instant Out-of-the-Box Dev Mode ---
function getMockTransactions(): Transaction[] {
  return [
    {
      _id: 'tx_1',
      type: 'expense',
      amount: 1450,
      currency: 'PKR',
      category: 'Food & Dining',
      account: 'JazzCash',
      personName: 'Tehzeeb Bakery',
      note: 'Fresh bread & cakes',
      rawText: 'Spent 1450 at Tehzeeb via JazzCash',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      _id: 'tx_2',
      type: 'transfer',
      amount: 5000,
      currency: 'PKR',
      category: 'Friends & Debt',
      account: 'Meezan Bank',
      personName: 'Ali Khan',
      note: 'Dinner split transfer',
      rawText: 'Sent 5000 to Ali Khan via Meezan',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      _id: 'tx_3',
      type: 'income',
      amount: 45000,
      currency: 'PKR',
      category: 'Freelance / Salary',
      account: 'EasyPaisa',
      personName: 'Client Payment',
      note: 'Website design milestone',
      rawText: 'Recieved 45000 on EasyPaisa',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 48).toISOString()
    }
  ];
}

function getMockPersons(): Person[] {
  return [
    {
      _id: 'p_1',
      name: 'Ali Khan',
      aliases: ['Ali', 'Ali K', 'Ali Khan'],
      accounts: ['JazzCash', 'Meezan Bank'],
      netBalance: 5000, // owes user 5000 PKR
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      _id: 'p_2',
      name: 'Usman Ahmed',
      aliases: ['Usman', 'Usman A'],
      accounts: ['EasyPaisa', 'HBL'],
      netBalance: -2500, // user owes Usman 2500 PKR
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
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
    categoryBreakdown: {
      'Food & Dining': 1450,
      'Bills & Utilities': 3200,
      'Groceries': 8500
    }
  };
}
