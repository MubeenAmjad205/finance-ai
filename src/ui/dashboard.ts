import { Transaction, Person, Account } from '../db/types';
import { escapeHtml } from './sanitize';
import { dashboardCss } from './templates/dashboardCss';
import { AccountService } from '../services/accountService';

function formatPkr(num: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(num);
}

export function renderDashboardHtml(
  monthName: string,
  stats: { totalIncome: number; totalExpense: number; categoryBreakdown: Record<string, number> },
  accounts: Account[],
  persons: Person[],
  recentTransactions: Transaction[]
): string {
  const netSavings = stats.totalIncome - stats.totalExpense;
  const savingsRate = stats.totalIncome > 0 ? Math.round((netSavings / stats.totalIncome) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finance AI — Minimal Personal Budget</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    ${dashboardCss}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div>
          <h1>Finance AI Overview</h1>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Cloudflare Workers AI • Real-Time Finance</p>
        </div>
      </div>
      <div class="month-badge">
        📅 ${escapeHtml(monthName)}
      </div>
    </header>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="kpi-card income">
        <div class="kpi-title">Monthly Income <span>💵</span></div>
        <div class="kpi-value" style="color: var(--accent-green);">${formatPkr(stats.totalIncome)}</div>
        <div class="kpi-sub">${escapeHtml(monthName)}</div>
      </div>
      <div class="kpi-card expense">
        <div class="kpi-title">Monthly Expense <span>💸</span></div>
        <div class="kpi-value" style="color: var(--accent-red);">${formatPkr(stats.totalExpense)}</div>
        <div class="kpi-sub">${escapeHtml(monthName)}</div>
      </div>
      <div class="kpi-card net">
        <div class="kpi-title">Net Savings <span>📈</span></div>
        <div class="kpi-value" style="color: var(--accent-blue);">${formatPkr(netSavings)}</div>
        <div class="kpi-sub">Savings Rate: ${savingsRate}%</div>
      </div>
      <div class="kpi-card rate">
        <div class="kpi-title">Accounts Tracked <span>🏦</span></div>
        <div class="kpi-value" style="color: var(--accent-purple);">${accounts.length}</div>
        <div class="kpi-sub">Dynamic Wallets & Banks</div>
      </div>
    </div>

    <!-- Layout Grid -->
    <div class="layout-grid">
      <!-- Left: Accounts & Persons -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏦 Dynamic Wallets & Accounts</div>
        </div>
        <div class="list">
          ${accounts.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No accounts recorded yet. Initialize via bot command /setbalance.</p>' : ''}
          ${accounts.map(acc => `
            <div class="list-item">
              <div class="item-left">
                <span>${AccountService.getAccountEmoji(acc.name)}</span>
                <div>
                  <div class="item-name">${escapeHtml(acc.name)}</div>
                  <div class="item-sub">${escapeHtml(acc.type.toUpperCase())}</div>
                </div>
              </div>
              <div class="item-amount">${formatPkr(acc.balance)}</div>
            </div>
          `).join('')}
        </div>

        <div class="card-header" style="margin-top: 2rem;">
          <div class="card-title">👥 Counterparties Ledger</div>
        </div>
        <div class="list">
          ${persons.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No counterparties recorded yet.</p>' : ''}
          ${persons.map(p => `
            <div class="list-item">
              <div class="item-left">
                <span>👤</span>
                <div>
                  <div class="item-name">${escapeHtml(p.name)}</div>
                  <div class="item-sub">${escapeHtml(p.aliases.join(', '))}</div>
                </div>
              </div>
              <div class="item-amount ${p.netBalance > 0 ? 'pos' : p.netBalance < 0 ? 'neg' : ''}">
                ${p.netBalance > 0 ? 'Owes +' + formatPkr(p.netBalance) : p.netBalance < 0 ? 'You owe -' + formatPkr(Math.abs(p.netBalance)) : 'Settled'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Right: Category Breakdown -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 Spending Categories</div>
        </div>
        <div class="list">
          ${Object.keys(stats.categoryBreakdown).length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No expenses logged this month.</p>' : ''}
          ${Object.entries(stats.categoryBreakdown).map(([cat, amt]) => {
            const pct = stats.totalExpense > 0 ? Math.round((amt / stats.totalExpense) * 100) : 0;
            return `
              <div class="list-item">
                <div class="item-left">
                  <span>🏷️</span>
                  <div>
                    <div class="item-name">${escapeHtml(cat)}</div>
                    <div class="item-sub">${pct}% of expenses</div>
                  </div>
                </div>
                <div class="item-amount">${formatPkr(amt)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Recent Activity Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🧾 Recent Confirmed Transactions</div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Details</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${recentTransactions.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No transactions recorded yet. Message your Telegram bot!</td></tr>' : ''}
            ${recentTransactions.map(tx => `
              <tr>
                <td><span class="tag ${escapeHtml(tx.type)}">${escapeHtml(tx.type)}</span></td>
                <td>
                  <div style="font-weight: 500;">${escapeHtml(tx.note || tx.rawText)}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(tx.category)}${tx.personName ? ' • ' + escapeHtml(tx.personName) : ''}</div>
                </td>
                <td>${escapeHtml(tx.account)}</td>
                <td style="font-weight: 600; color: ${tx.type === 'income' ? 'var(--accent-green)' : 'var(--text-main)'};">
                  ${tx.type === 'income' ? '+' : '-'}${formatPkr(tx.amount)}
                </td>
                <td style="color: var(--text-muted);">${new Date(tx.timestamp).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <footer>
      🔒 Cryptographically Audited Personal Finance • Cloudflare Workers AI & MongoDB Atlas
    </footer>
  </div>
</body>
</html>`;
}
