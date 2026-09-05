import { RecurringBill } from '../db/types';

export class RecurringBillService {
  /**
   * Check which bills are due within the next 3 days, correctly handling month boundary wrap-around
   */
  static getUpcomingBillsDue(currentDate: Date = new Date(), bills: RecurringBill[] = []): RecurringBill[] {
    const list = bills;
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
