import { Transaction, Person, Account } from '../db/types';
import { escapeHtml } from './sanitize';

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
    :root {
      --bg-dark: #0b0f17;
      --card-bg: rgba(22, 31, 47, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-blue: #3b82f6;
      --accent-purple: #8b5cf6;
      --accent-amber: #f59e0b;
      --radius: 16px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    
    body {
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 15% 15%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
        radial-gradient(at 85% 85%, rgba(139, 92, 246, 0.12) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
    }

    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.2rem;
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }

    .brand-title h1 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .brand-title p {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: var(--accent-green);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
    }

    /* Grid Layouts */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 1.5rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .card:hover {
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .kpi-label {
      font-size: 0.825rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .kpi-value {
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .kpi-sub {
      font-size: 0.75rem;
      margin-top: 0.5rem;
      color: var(--text-muted);
    }

    .income-val { color: var(--accent-green); }
    .expense-val { color: var(--accent-red); }
    .savings-val { color: var(--accent-blue); }
    .debt-val { color: var(--accent-amber); }

    /* Content Layout */
    .main-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 868px) {
      .main-grid { grid-template-columns: 1fr; }
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Accounts List */
    .accounts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .account-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1rem;
    }

    .account-name {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }

    .account-balance {
      font-size: 1.15rem;
      font-weight: 700;
    }

    /* Category Meters */
    .cat-item {
      margin-bottom: 1rem;
    }

    .cat-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      margin-bottom: 0.35rem;
    }

    .cat-bar-bg {
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
    }

    .cat-bar-fill {
      height: 100%;
      border-radius: 9999px;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
    }

    /* Tables & Feed */
    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    th {
      padding: 0.75rem 1rem;
      color: var(--text-muted);
      font-weight: 500;
      border-bottom: 1px solid var(--card-border);
    }

    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .tx-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-expense { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }
    .badge-income { background: rgba(16, 185, 129, 0.15); color: var(--accent-green); }
    .badge-transfer { background: rgba(59, 130, 246, 0.15); color: var(--accent-blue); }

    .person-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .person-name { font-weight: 600; font-size: 0.9rem; }
    .person-aliases { font-size: 0.75rem; color: var(--text-muted); }

    footer {
      text-align: center;
      margin-top: 3rem;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Header -->
    <header>
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div class="brand-title">
          <h1>Finance AI Overview</h1>
          <p>Cloudflare Workers AI • Telegram Bot Powered</p>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span>
        Workers AI Online
      </div>
    </header>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
      <div class="card">
        <div class="kpi-label">Total Monthly Income <span>💵</span></div>
        <div class="kpi-value income-val">${formatPkr(stats.totalIncome)}</div>
        <div class="kpi-sub">${monthName}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Total Monthly Expense <span>💸</span></div>
        <div class="kpi-value expense-val">${formatPkr(stats.totalExpense)}</div>
        <div class="kpi-sub">${monthName}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Net Savings <span>📈</span></div>
        <div class="kpi-value savings-val">${formatPkr(netSavings)}</div>
        <div class="kpi-sub">Savings Rate: ${savingsRate}%</div>
      </div>
      <div class="card">
        <div class="kpi-label">Accounts Tracked <span>🏦</span></div>
        <div class="kpi-value debt-val">${accounts.length}</div>
        <div class="kpi-sub">JazzCash, EasyPaisa, Banks</div>
      </div>
    </div>

    <!-- Accounts Overview -->
    <h2 class="section-title">🏦 Payment Wallets & Accounts</h2>
    <div class="accounts-grid">
      ${accounts.map(acc => `
        <div class="account-card">
          <div class="account-name">${getAccIcon(acc.name)} ${escapeHtml(acc.name)}</div>
          <div class="account-balance">${formatPkr(acc.balance)}</div>
        </div>
      `).join('')}
    </div>

    <!-- Main Grid: Recent Activity & Categories -->
    <div class="main-grid">
      <!-- Left Column: Transactions -->
      <div class="card">
        <h2 class="section-title">🧾 Recent Activity Feed</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Note / Category</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${recentTransactions.length === 0 ? '<tr><td colspan="5">No transactions recorded yet. Message your Telegram bot to add one!</td></tr>' : ''}
              ${recentTransactions.map(tx => `
                <tr>
                  <td><span class="tx-badge badge-${escapeHtml(tx.type)}">${escapeHtml(tx.type)}</span></td>
                  <td>
                    <div style="font-weight: 500;">${escapeHtml(tx.note || tx.rawText)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(tx.category)} ${tx.personName ? '• ' + escapeHtml(tx.personName) : ''}</div>
                  </td>
                  <td><span style="font-size: 0.8rem; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px;">${escapeHtml(tx.account)}</span></td>
                  <td style="font-weight: 600; color: ${tx.type === 'income' ? 'var(--accent-green)' : 'var(--text-main)'};">
                    ${tx.type === 'income' ? '+' : '-'}${formatPkr(tx.amount)}
                  </td>
                  <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(tx.timestamp).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right Column: Category Meter & Person Ledger -->
      <div>
        <div class="card" style="margin-bottom: 1.5rem;">
          <h2 class="section-title">📊 Spending Categories</h2>
          ${Object.keys(stats.categoryBreakdown).length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No spending recorded this month.</p>' : ''}
          ${Object.entries(stats.categoryBreakdown).map(([cat, amt]) => {
            const pct = stats.totalExpense > 0 ? Math.round((amt / stats.totalExpense) * 100) : 0;
            return `
              <div class="cat-item">
                <div class="cat-meta">
                  <span>${escapeHtml(cat)}</span>
                  <span style="font-weight: 600;">${formatPkr(amt)} (${pct}%)</span>
                </div>
                <div class="cat-bar-bg">
                  <div class="cat-bar-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="card">
          <h2 class="section-title">👥 Person Ledger</h2>
          ${persons.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No counterparties logged.</p>' : ''}
          ${persons.map(p => `
            <div class="person-row">
              <div>
                <div class="person-name">${escapeHtml(p.name)}</div>
                <div class="person-aliases">${escapeHtml(p.aliases.join(', '))}</div>
              </div>
              <div style="font-weight: 600; font-size: 0.85rem; color: ${p.netBalance > 0 ? 'var(--accent-green)' : p.netBalance < 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">
                ${p.netBalance > 0 ? 'Owes +' + formatPkr(p.netBalance) : p.netBalance < 0 ? 'You owe -' + formatPkr(Math.abs(p.netBalance)) : 'Settled'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <footer>
      Public & Open Source Personal Budgeting Worker • Powered by Cloudflare Workers AI & MongoDB Atlas Data API
    </footer>
  </div>
</body>
</html>`;
}

function formatPkr(num: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(num);
}

function getAccIcon(acc: string): string {
  const a = acc.toLowerCase();
  if (a.includes('jazzcash')) return '📱';
  if (a.includes('easypaisa')) return '📲';
  if (a.includes('meezan') || a.includes('hbl')) return '🏦';
  if (a.includes('cash')) return '💵';
  return '💳';
}
