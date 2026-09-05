import { GroupExpense, NetGroupBalance } from '../groupExpense';

export class SettlementCalculator {
  /**
   * Calculate multi-day net settlement matrix between colleagues
   */
  static calculateNetSettlements(expenses: GroupExpense[]): NetGroupBalance[] {
    const balances: Record<string, number> = {};

    for (const exp of expenses) {
      const payer = exp.paidBy.username ? `@${exp.paidBy.username}` : exp.paidBy.name;
      for (const p of exp.participants) {
        if (p.status === 'unpaid') {
          const debtor = p.username ? `@${p.username}` : p.name;
          if (debtor.toLowerCase() !== payer.toLowerCase()) {
            balances[debtor] = (balances[debtor] || 0) - p.shareAmount;
            balances[payer] = (balances[payer] || 0) + p.shareAmount;
          }
        }
      }
    }

    const debtors: { name: string; amount: number }[] = [];
    const creditors: { name: string; amount: number }[] = [];

    for (const [name, net] of Object.entries(balances)) {
      if (net < -1) debtors.push({ name, amount: Math.abs(net) });
      if (net > 1) creditors.push({ name, amount: net });
    }

    const settlements: NetGroupBalance[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debt = debtors[i];
      const cred = creditors[j];
      const minAmount = Math.min(debt.amount, cred.amount);

      settlements.push({
        fromUser: debt.name,
        toUser: cred.name,
        amount: Math.round(minAmount)
      });

      debt.amount -= minAmount;
      cred.amount -= minAmount;

      if (debt.amount <= 1) i++;
      if (cred.amount <= 1) j++;
    }

    return settlements;
  }

  /**
   * Get detailed breakdown for a specific user
   */
  static getUserFinancialProfile(expenses: GroupExpense[], targetUser: string): {
    normalizedName: string;
    totalPaid: number;
    totalShare: number;
    netBalance: number;
    owesList: { toUser: string; amount: number }[];
    isOwedByList: { fromUser: string; amount: number }[];
  } {
    const cleanTarget = targetUser.trim().replace('@', '').toLowerCase();
    let totalPaid = 0;
    let totalShare = 0;

    for (const exp of expenses) {
      const payerClean = (exp.paidBy.username || exp.paidBy.name).trim().replace('@', '').toLowerCase();
      if (payerClean === cleanTarget) {
        totalPaid += exp.totalAmount;
      }

      for (const p of exp.participants) {
        const pClean = (p.username || p.name).trim().replace('@', '').toLowerCase();
        if (pClean === cleanTarget) {
          totalShare += p.shareAmount;
        }
      }
    }

    const settlements = this.calculateNetSettlements(expenses);
    const owesList: { toUser: string; amount: number }[] = [];
    const isOwedByList: { fromUser: string; amount: number }[] = [];
    let netBalance = 0;

    for (const s of settlements) {
      const fromClean = s.fromUser.trim().replace('@', '').toLowerCase();
      const toClean = s.toUser.trim().replace('@', '').toLowerCase();

      if (fromClean === cleanTarget) {
        owesList.push({ toUser: s.toUser, amount: s.amount });
        netBalance -= s.amount;
      }

      if (toClean === cleanTarget) {
        isOwedByList.push({ fromUser: s.fromUser, amount: s.amount });
        netBalance += s.amount;
      }
    }

    return {
      normalizedName: targetUser.startsWith('@') ? targetUser : `@${targetUser}`,
      totalPaid,
      totalShare,
      netBalance,
      owesList,
      isOwedByList
    };
  }
}
