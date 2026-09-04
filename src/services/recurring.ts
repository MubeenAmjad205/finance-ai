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
   * Check which bills are due within the next 3 days, correctly handling month boundary wrap-around
   */
  static getUpcomingBillsDue(currentDate: Date = new Date(), bills?: RecurringBill[]): RecurringBill[] {
    const list = bills || this.getDefaultBills();
    const currentDay = currentDate.getDate();
    // Days in current month
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    return list.filter(bill => {
      let diff = bill.dueDayOfMonth - currentDay;
      // Handle month-end boundary wrap-around: if current day is near end of month (e.g. 30/31) and bill is due on 1st, 2nd, 3rd
      if (diff < 0 && currentDay >= daysInMonth - 3) {
        diff = daysInMonth - currentDay + bill.dueDayOfMonth;
      }
      return diff >= 0 && diff <= 3;
    });
  }
}
