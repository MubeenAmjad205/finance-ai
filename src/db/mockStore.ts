import { Transaction, Person, Account, BudgetCap, Reminder, SavingsGoal, Kameti } from './types';

export class InMemoryMockStore {
  private static instance: InMemoryMockStore;

  public kametis: Kameti[] = [
    {
      _id: 'kameti_1',
      name: 'Office Monthly Kameti',
      monthlyAmount: 10000,
      totalMonths: 10,
      startDate: new Date().toISOString().substring(0, 10),
      currentMonth: 1,
      status: 'active',
      createdAt: new Date().toISOString(),
      members: [
        { name: 'Ali Khan', payoutMonth: 1, payoutReceived: false, paidMonths: [1] },
        { name: 'Usman Ahmed', payoutMonth: 2, payoutReceived: false, paidMonths: [1] },
        { name: 'Hamza Tariq', payoutMonth: 3, payoutReceived: false, paidMonths: [] },
        { name: 'Bilal Farooq', payoutMonth: 4, payoutReceived: false, paidMonths: [] }
      ]
    }
  ];

  public transactions: Transaction[] = [
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
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
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
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
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
      rawText: 'Received 45000 on EasyPaisa',
      status: 'confirmed',
      timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString()
    }
  ];

  public persons: Person[] = [
    {
      _id: 'p_1',
      name: 'Ali Khan',
      aliases: ['Ali', 'Ali K', 'Ali Khan'],
      accounts: ['JazzCash', 'Meezan Bank'],
      netBalance: 5000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      _id: 'p_2',
      name: 'Usman Ahmed',
      aliases: ['Usman', 'Usman A'],
      accounts: ['EasyPaisa', 'HBL'],
      netBalance: -2500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  public accounts: Account[] = [
    { _id: 'acc_1', name: 'JazzCash', type: 'mobile_wallet', balance: 18450, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_2', name: 'EasyPaisa', type: 'mobile_wallet', balance: 32000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_3', name: 'Meezan Bank', type: 'bank', balance: 125000, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_4', name: 'NayaPay', type: 'mobile_wallet', balance: 6500, currency: 'PKR', updatedAt: new Date().toISOString() },
    { _id: 'acc_5', name: 'Cash', type: 'cash', balance: 4200, currency: 'PKR', updatedAt: new Date().toISOString() }
  ];

  public budgetCaps: BudgetCap[] = [
    { _id: 'b_1', category: 'Food & Dining', monthlyLimit: 25000, alertThresholdPct: 80, updatedAt: new Date().toISOString() },
    { _id: 'b_2', category: 'Groceries', monthlyLimit: 40000, alertThresholdPct: 80, updatedAt: new Date().toISOString() },
    { _id: 'b_3', category: 'Entertainment', monthlyLimit: 10000, alertThresholdPct: 75, updatedAt: new Date().toISOString() },
    { _id: 'b_4', category: 'Shopping', monthlyLimit: 20000, alertThresholdPct: 80, updatedAt: new Date().toISOString() }
  ];

  public reminders: Reminder[] = [
    { _id: 'rem_1', text: 'Pay K-Electric bill on 10th', isTriggered: false, createdAt: new Date().toISOString() }
  ];

  public goals: SavingsGoal[] = [
    { _id: 'g_1', title: 'Emergency Savings Fund', targetAmount: 100000, currentAmount: 45000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { _id: 'g_2', title: 'New Laptop / Upgrade', targetAmount: 150000, currentAmount: 30000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ];

  public static getInstance(): InMemoryMockStore {
    if (!InMemoryMockStore.instance) {
      InMemoryMockStore.instance = new InMemoryMockStore();
    }
    return InMemoryMockStore.instance;
  }
}
