import { Transaction, Person, Account, BudgetCap, Reminder, SavingsGoal, Kameti, WhitelistEntry } from './types';

export class InMemoryMockStore {
  private static instance: InMemoryMockStore;

  public transactions: Transaction[] = [];
  public persons: Person[] = [];
  public accounts: Account[] = [
    { name: 'JazzCash', type: 'mobile_wallet', balance: 15000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { name: 'EasyPaisa', type: 'mobile_wallet', balance: 8500, currency: 'PKR', updatedAt: new Date().toISOString() },
    { name: 'Meezan Bank', type: 'bank', balance: 120000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { name: 'HBL', type: 'bank', balance: 45000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { name: 'Cash', type: 'cash', balance: 5000, currency: 'PKR', updatedAt: new Date().toISOString() }
  ];
  public budgets: BudgetCap[] = [];
  public reminders: Reminder[] = [];
  public goals: SavingsGoal[] = [];
  public groupExpenses: any[] = [];
  public groupAuditLogs: any[] = [];
  public kametis: Kameti[] = [];
  public whitelist: WhitelistEntry[] = [];

  public static getInstance(): InMemoryMockStore {
    if (!InMemoryMockStore.instance) {
      InMemoryMockStore.instance = new InMemoryMockStore();
    }
    return InMemoryMockStore.instance;
  }

  // --- Transactions ---
  createTransaction(tx: Omit<Transaction, '_id' | 'createdAt'>): string {
    const id = `tx_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newTx: Transaction = {
      _id: id,
      ...tx,
      createdAt: new Date().toISOString()
    };
    this.transactions.push(newTx);
    return id;
  }

  getTransactionById(id: string): Transaction | null {
    return this.transactions.find(t => t._id === id) || null;
  }

  updateTransaction(id: string, update: Partial<Transaction>): boolean {
    const idx = this.transactions.findIndex(t => t._id === id);
    if (idx === -1) return false;
    this.transactions[idx] = { ...this.transactions[idx], ...update };
    return true;
  }

  getLastConfirmedTransaction(): Transaction | null {
    const confirmed = this.transactions.filter(t => t.status === 'confirmed');
    if (confirmed.length === 0) return null;
    return confirmed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }

  getRecentTransactions(limit = 10): Transaction[] {
    return [...this.transactions]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getTransactionsByMonth(monthIsoPrefix: string): Transaction[] {
    return this.transactions.filter(t => t.timestamp.startsWith(monthIsoPrefix));
  }

  deleteTransaction(id: string): boolean {
    const idx = this.transactions.findIndex(t => t._id === id);
    if (idx === -1) return false;
    this.transactions.splice(idx, 1);
    return true;
  }

  // --- Accounts ---
  getAllAccounts(): Account[] {
    return [...this.accounts];
  }

  setAccountBalance(name: string, balance: number): boolean {
    const acc = this.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (acc) {
      acc.balance = balance;
      acc.updatedAt = new Date().toISOString();
    } else {
      this.accounts.push({
        name,
        type: 'mobile_wallet',
        balance,
        currency: 'PKR',
        updatedAt: new Date().toISOString()
      });
    }
    return true;
  }

  updateAccountBalance(name: string, delta: number): boolean {
    const acc = this.accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (acc) {
      acc.balance += delta;
      acc.updatedAt = new Date().toISOString();
    } else {
      this.accounts.push({
        name,
        type: 'mobile_wallet',
        balance: delta,
        currency: 'PKR',
        updatedAt: new Date().toISOString()
      });
    }
    return true;
  }

  // --- Persons ---
  getAllPersons(): Person[] {
    return [...this.persons];
  }

  findPersonByNameOrAlias(name: string): Person | null {
    const trimmed = name.trim().toLowerCase();
    return (
      this.persons.find(
        p => p.name.toLowerCase() === trimmed || p.aliases.some(a => a.toLowerCase() === trimmed)
      ) || null
    );
  }

  createPerson(name: string, initialAccount?: string): Person {
    const id = `person_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const person: Person = {
      _id: id,
      name,
      aliases: [name],
      accounts: initialAccount ? [initialAccount] : ['Default'],
      netBalance: 0,
      createdAt: now,
      updatedAt: now
    };
    this.persons.push(person);
    return person;
  }

  updatePersonBalance(personId: string, delta: number): void {
    const person = this.persons.find(p => p._id === personId);
    if (person) {
      person.netBalance += delta;
      person.updatedAt = new Date().toISOString();
    }
  }

  addPersonAlias(personId: string, alias: string): void {
    const person = this.persons.find(p => p._id === personId);
    if (person && !person.aliases.includes(alias)) {
      person.aliases.push(alias);
      person.updatedAt = new Date().toISOString();
    }
  }

  mergePersons(primaryId: string, targetId: string, aliasToAdd: string): Person | null {
    const targetIdx = this.persons.findIndex(p => p._id === targetId);
    const primary = this.persons.find(p => p._id === primaryId);
    if (!primary || targetIdx === -1) return null;

    const target = this.persons[targetIdx];
    primary.aliases = Array.from(new Set([...primary.aliases, target.name, ...target.aliases, aliasToAdd]));
    primary.netBalance += target.netBalance;
    primary.updatedAt = new Date().toISOString();

    for (const tx of this.transactions) {
      if (tx.personId === targetId) {
        tx.personId = primaryId;
      }
    }

    this.persons.splice(targetIdx, 1);
    return primary;
  }

  // --- Budgets ---
  getBudgetCaps(): BudgetCap[] {
    return [...this.budgets];
  }

  setBudgetCap(category: string, monthlyLimit: number, alertThresholdPct = 80): BudgetCap {
    const now = new Date().toISOString();
    const idx = this.budgets.findIndex(b => b.category.toLowerCase() === category.toLowerCase());
    if (idx !== -1) {
      this.budgets[idx] = { ...this.budgets[idx], monthlyLimit, alertThresholdPct, updatedAt: now };
      return this.budgets[idx];
    }
    const newCap: BudgetCap = {
      _id: `budget_mock_${Date.now()}`,
      category,
      monthlyLimit,
      alertThresholdPct,
      updatedAt: now
    };
    this.budgets.push(newCap);
    return newCap;
  }

  // --- Reminders ---
  getReminders(): Reminder[] {
    return [...this.reminders];
  }

  addReminder(text: string, chatId?: string | number): Reminder {
    const reminder: Reminder = {
      _id: `rem_mock_${Date.now()}`,
      text,
      chatId,
      isTriggered: false,
      createdAt: new Date().toISOString()
    };
    this.reminders.push(reminder);
    return reminder;
  }

  // --- Goals ---
  getGoals(): SavingsGoal[] {
    return [...this.goals];
  }

  setGoal(title: string, targetAmount: number, currentAmount = 0): SavingsGoal {
    const now = new Date().toISOString();
    const idx = this.goals.findIndex(g => g.title.toLowerCase() === title.toLowerCase());
    if (idx !== -1) {
      this.goals[idx] = { ...this.goals[idx], targetAmount, currentAmount, updatedAt: now };
      return this.goals[idx];
    }
    const newGoal: SavingsGoal = {
      _id: `goal_mock_${Date.now()}`,
      title,
      targetAmount,
      currentAmount,
      updatedAt: now,
      createdAt: now
    };
    this.goals.push(newGoal);
    return newGoal;
  }

  updateGoalProgress(title: string, deltaAmount: number): void {
    const goal = this.goals.find(g => g.title.toLowerCase() === title.toLowerCase());
    if (goal) {
      goal.currentAmount += deltaAmount;
      goal.updatedAt = new Date().toISOString();
    }
  }

  // --- Group Expenses ---
  createGroupExpense(exp: any): string {
    const id = exp._id || `gexp_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const doc = { _id: id, ...exp, createdAt: new Date().toISOString() };
    this.groupExpenses.push(doc);
    return id;
  }

  getGroupExpensesByGroupId(groupId: string | number): any[] {
    const strId = String(groupId);
    return this.groupExpenses.filter(e => String(e.groupId) === strId);
  }

  updateGroupExpense(id: string, update: Record<string, any>): boolean {
    const idx = this.groupExpenses.findIndex(e => e._id === id);
    if (idx === -1) return false;
    this.groupExpenses[idx] = { ...this.groupExpenses[idx], ...update };
    return true;
  }

  deleteGroupExpense(id: string): boolean {
    const idx = this.groupExpenses.findIndex(e => e._id === id);
    if (idx === -1) return false;
    this.groupExpenses.splice(idx, 1);
    return true;
  }

  getLastGroupExpense(groupId: string | number): any | null {
    const exps = this.getGroupExpensesByGroupId(groupId);
    if (exps.length === 0) return null;
    return exps.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())[0];
  }

  // --- Group Audit Logs ---
  createGroupAuditLog(audit: any): string {
    const id = audit._id || `audit_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const doc = { _id: id, ...audit, createdAt: new Date().toISOString() };
    this.groupAuditLogs.push(doc);
    return id;
  }

  getGroupAuditLogsByGroupId(groupId: string | number, limit = 20): any[] {
    const strId = String(groupId);
    return this.groupAuditLogs
      .filter(l => String(l.groupId) === strId)
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, limit);
  }

  // --- Kametis ---
  getKametis(): Kameti[] {
    return [...this.kametis];
  }

  getKametiById(id: string): Kameti | null {
    return this.kametis.find(k => k._id === id) || null;
  }

  getKametiByName(name: string): Kameti | null {
    return this.kametis.find(k => k.name.toLowerCase() === name.toLowerCase()) || null;
  }

  createKameti(data: Omit<Kameti, '_id' | 'createdAt'>): Kameti {
    const id = `kameti_mock_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const newKameti: Kameti = {
      _id: id,
      ...data,
      createdAt
    };
    this.kametis.push(newKameti);
    return newKameti;
  }

  updateKametiMembers(id: string, members: any[]): boolean {
    const kameti = this.getKametiById(id);
    if (!kameti) return false;
    kameti.members = members;
    return true;
  }

  advanceKametiMonth(id: string): number | null {
    const kameti = this.getKametiById(id);
    if (!kameti) return null;
    if (kameti.currentMonth >= kameti.totalMonths) {
      kameti.status = 'completed';
    } else {
      kameti.currentMonth += 1;
    }
    return kameti.currentMonth;
  }

  // --- Whitelist ---
  getWhitelist(): WhitelistEntry[] {
    return [...this.whitelist];
  }

  isWhitelisted(userId: string): boolean {
    return this.whitelist.some(w => w.userId === userId);
  }

  addWhitelistEntry(entry: WhitelistEntry): WhitelistEntry {
    const idx = this.whitelist.findIndex(w => w.userId === entry.userId);
    if (idx !== -1) {
      this.whitelist[idx] = entry;
    } else {
      this.whitelist.push(entry);
    }
    return entry;
  }

  removeWhitelistEntry(userId: string): boolean {
    const idx = this.whitelist.findIndex(w => w.userId === userId);
    if (idx === -1) return false;
    this.whitelist.splice(idx, 1);
    return true;
  }
}
