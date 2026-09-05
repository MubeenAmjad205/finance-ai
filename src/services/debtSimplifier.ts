export interface SimplifiedSettlement {
  from: string; // Debtor (pays)
  to: string;   // Creditor (receives)
  amount: number;
}

export class DebtSimplifier {
  /**
   * Minimum Cash Flow Algorithm (Splitwise-style Debt Simplification)
   * Takes a dictionary of participant net balances (positive = is owed money, negative = owes money)
   * Returns the minimal set of direct transfers needed to settle all debts to 0.
   */
  static simplifyDebts(netBalances: Record<string, number>): SimplifiedSettlement[] {
    // Separate into debtors (< 0) and creditors (> 0)
    const debtors: { person: string; amount: number }[] = [];
    const creditors: { person: string; amount: number }[] = [];

    for (const [person, balance] of Object.entries(netBalances)) {
      const rounded = Math.round(balance);
      if (rounded < 0) {
        debtors.push({ person, amount: -rounded }); // positive debt amount
      } else if (rounded > 0) {
        creditors.push({ person, amount: rounded });
      }
    }

    // Sort descending by magnitude
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: SimplifiedSettlement[] = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const transferAmount = Math.min(debtor.amount, creditor.amount);

      if (transferAmount > 0) {
        settlements.push({
          from: debtor.person,
          to: creditor.person,
          amount: transferAmount
        });
      }

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount === 0) dIdx++;
      if (creditor.amount === 0) cIdx++;
    }

    return settlements;
  }
}
