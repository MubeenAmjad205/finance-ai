export const dashboardCss = `
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
  }

  .month-badge {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
    border: 1px solid var(--card-border);
  }

  /* KPI Cards Grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
  }

  .kpi-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    backdrop-filter: blur(12px);
    border-radius: var(--radius);
    padding: 1.5rem;
    position: relative;
    overflow: hidden;
  }

  .kpi-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  .kpi-card.income::before { background: var(--accent-green); }
  .kpi-card.expense::before { background: var(--accent-red); }
  .kpi-card.net::before { background: var(--accent-blue); }
  .kpi-card.rate::before { background: var(--accent-purple); }

  .kpi-title {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .kpi-value {
    font-size: 1.75rem;
    font-weight: 700;
  }

  .kpi-sub {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  /* Two Column Layout */
  .layout-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  @media (max-width: 768px) {
    .layout-grid { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    backdrop-filter: blur(12px);
    border-radius: var(--radius);
    padding: 1.5rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .card-title {
    font-size: 1.1rem;
    font-weight: 600;
  }

  /* Lists */
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .item-name {
    font-weight: 500;
    font-size: 0.95rem;
  }

  .item-sub {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .item-amount {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .item-amount.pos { color: var(--accent-green); }
  .item-amount.neg { color: var(--accent-red); }

  /* Table */
  .table-responsive {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.9rem;
  }

  th {
    color: var(--text-muted);
    font-weight: 500;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--card-border);
  }

  td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  tr:last-child td {
    border-bottom: none;
  }

  .tag {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .tag.expense { background: rgba(239, 68, 68, 0.15); color: #f87171; }
  .tag.income { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .tag.transfer { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .tag.debt_given { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
  .tag.debt_received { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }

  footer {
    text-align: center;
    margin-top: 3rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
`;
