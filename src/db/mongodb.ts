import { Env, Transaction, Person, Account, BudgetCap, Reminder, SavingsGoal, Kameti, WhitelistEntry } from './types';
import { MongoDBAtlasClient } from './client';
import { TransactionRepository } from './repositories/transactionRepo';
import { PersonRepository } from './repositories/personRepo';
import { AccountRepository } from './repositories/accountRepo';
import { BudgetRepository } from './repositories/budgetRepo';
import { ReminderRepository } from './repositories/reminderRepo';
import { GoalRepository } from './repositories/goalRepo';
import { GroupExpenseRepository } from './repositories/groupExpenseRepo';
import { GroupAuditRepository } from './repositories/groupAuditRepo';
import { KametiRepository } from './repositories/kametiRepo';
import { WhitelistRepository } from './repositories/whitelistRepo';

/**
 * Unified Database Facade for Cloudflare Workers & MongoDB Atlas Data API.
 */
export class MongoDBClient {
  public client: MongoDBAtlasClient;

  public transactions: TransactionRepository;
  public persons: PersonRepository;
  public accounts: AccountRepository;
  public budgets: BudgetRepository;
  public reminders: ReminderRepository;
  public goals: GoalRepository;
  public groupExpenses: GroupExpenseRepository;
  public groupAudits: GroupAuditRepository;
  public kametis: KametiRepository;
  public whitelist: WhitelistRepository;

  constructor(env: Env) {
    this.client = new MongoDBAtlasClient(env);

    this.transactions = new TransactionRepository(this.client);
    this.persons = new PersonRepository(this.client);
    this.accounts = new AccountRepository(this.client);
    this.budgets = new BudgetRepository(this.client);
    this.reminders = new ReminderRepository(this.client);
    this.goals = new GoalRepository(this.client);
    this.groupExpenses = new GroupExpenseRepository(this.client);
    this.groupAudits = new GroupAuditRepository(this.client);
    this.kametis = new KametiRepository(this.client);
    this.whitelist = new WhitelistRepository(this.client);
  }

  // --- Transactions Facade ---
  async createTransaction(tx: Omit<Transaction, '_id' | 'createdAt'>): Promise<string> {
    return this.transactions.create(tx);
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    return this.transactions.getById(id);
  }

  async updateTransaction(id: string, update: Partial<Transaction>): Promise<boolean> {
    return this.transactions.update(id, update);
  }

  async getLastConfirmedTransaction(): Promise<Transaction | null> {
    return this.transactions.getLastConfirmed();
  }

  async getRecentTransactions(limit = 20): Promise<Transaction[]> {
    return this.transactions.getRecent(limit);
  }

  async getMonthlyStats(monthIsoPrefix: string): Promise<{ totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> }> {
    return this.transactions.getMonthlyStats(monthIsoPrefix);
  }

  async getTransactionsByMonth(monthIsoPrefix: string): Promise<Transaction[]> {
    return this.transactions.getByMonth(monthIsoPrefix);
  }

  // --- Persons Facade ---
  async getAllPersons(): Promise<Person[]> {
    return this.persons.getAll();
  }

  async findPersonByNameOrAlias(name: string): Promise<Person | null> {
    return this.persons.findByNameOrAlias(name);
  }

  async createPerson(name: string, initialAccount?: string): Promise<Person> {
    return this.persons.create(name, initialAccount);
  }

  async updatePersonBalance(personId: string, amountDelta: number): Promise<void> {
    return this.persons.updateBalance(personId, amountDelta);
  }

  async addPersonAlias(personId: string, alias: string): Promise<void> {
    return this.persons.addAlias(personId, alias);
  }

  async mergePersons(primaryId: string, targetId: string, aliasToAdd: string): Promise<Person | null> {
    return this.persons.merge(primaryId, targetId, aliasToAdd);
  }

  // --- Accounts Facade ---
  async getAllAccounts(): Promise<Account[]> {
    return this.accounts.getAll();
  }

  async setAccountBalance(accountName: string, newBalance: number): Promise<void> {
    return this.accounts.setBalance(accountName, newBalance);
  }

  async updateAccountBalance(accountName: string, delta: number): Promise<void> {
    return this.accounts.updateBalance(accountName, delta);
  }

  // --- Budgets Facade ---
  async getBudgetCaps(): Promise<BudgetCap[]> {
    return this.budgets.getAll();
  }

  async setBudgetCap(category: string, monthlyLimit: number, alertThresholdPct = 80): Promise<BudgetCap> {
    return this.budgets.setLimit(category, monthlyLimit, alertThresholdPct);
  }

  // --- Reminders Facade ---
  async getReminders(): Promise<Reminder[]> {
    return this.reminders.getAll();
  }

  async addReminder(text: string, chatId?: string | number): Promise<Reminder> {
    return this.reminders.add(text, chatId);
  }

  // --- Goals Facade ---
  async getGoals(): Promise<SavingsGoal[]> {
    return this.goals.getAll();
  }

  async setGoal(title: string, targetAmount: number, currentAmount = 0): Promise<SavingsGoal> {
    return this.goals.setGoal(title, targetAmount, currentAmount);
  }

  // --- Group Expenses Facade ---
  async createGroupExpense(exp: any): Promise<string> {
    return this.groupExpenses.create(exp);
  }

  async getGroupExpensesByGroupId(groupId: string | number): Promise<any[]> {
    return this.groupExpenses.getByGroupId(groupId);
  }

  async updateGroupExpense(id: string, update: Record<string, any>): Promise<boolean> {
    return this.groupExpenses.update(id, update);
  }

  async deleteGroupExpense(id: string): Promise<boolean> {
    return this.groupExpenses.delete(id);
  }

  async getLastGroupExpense(groupId: string | number): Promise<any | null> {
    return this.groupExpenses.getLast(groupId);
  }

  // --- Group Audit Logs Facade ---
  async createGroupAuditLog(audit: any): Promise<string> {
    return this.groupAudits.create(audit);
  }

  async getGroupAuditLogsByGroupId(groupId: string | number, limit = 20): Promise<any[]> {
    return this.groupAudits.getByGroupId(groupId, limit);
  }

  // --- Kameti Facade ---
  async getAllKametis(): Promise<Kameti[]> {
    return this.kametis.getAll();
  }

  async getKametiByName(name: string): Promise<Kameti | null> {
    return this.kametis.getByName(name);
  }

  async createKameti(data: Omit<Kameti, '_id' | 'createdAt'>): Promise<Kameti> {
    return this.kametis.create(data);
  }

  async markKametiPaid(nameOrId: string, memberName: string, month?: number): Promise<boolean> {
    return this.kametis.markPaid(nameOrId, memberName, month);
  }

  async markKametiPayout(nameOrId: string, memberName: string): Promise<boolean> {
    return this.kametis.markPayoutReceived(nameOrId, memberName);
  }

  async advanceKametiMonth(nameOrId: string): Promise<number | null> {
    return this.kametis.advanceMonth(nameOrId);
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

  get whitelist(): WhitelistRepository {
    return this.client.whitelist;
  }
}
