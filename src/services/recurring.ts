import { RecurringBill } from '../db/types';

export class RecurringBillService {
  /**
   * Default recurring Pakistani bills template
   */
  static getDefaultBills(): RecurringBill[] {
    return [
      { title: 'Electricity (K-Electric / LESCO)', amount: 15000, category: 'Bills & Utilities', account: 'Meezan Bank', dueDayOfMonth: 10, autoNotify: true },
      { title: 'PTCL / Nayatel Fiber Internet', amount: 4500, category: 'Bills & Utilities', account: 'JazzCash', dueDayOfMonth: 5, autoNotify: true },
      { title: 'House Rent', amount: 45000, category: 'Rent', account: 'Meezan Bank', dueDayOfMonth: 1, autoNotify: true },
      { title: 'Maid / Cook Salary', amount: 18000, category: 'Salary', account: 'Cash', dueDayOfMonth: 1, autoNotify: true },
      { title: 'Netflix Subscription', amount: 1100, category: 'Entertainment', account: 'SadaPay', dueDayOfMonth: 15, autoNotify: true }
    ];
  }

  /**
   * Check which bills are due within the next 3 days
   */
  static getUpcomingBillsDue(currentDayOfMonth: number): RecurringBill[] {
    const defaultBills = this.getDefaultBills();
    return defaultBills.filter(bill => {
      const diff = bill.dueDayOfMonth - currentDayOfMonth;
      return diff >= 0 && diff <= 3;
    });
  }
}
