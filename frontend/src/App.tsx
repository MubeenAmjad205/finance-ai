import React, { useState, useEffect } from 'react';
import { Wallet, PieChart, Users, ArrowUpRight, ArrowDownLeft, ShieldCheck, Download, RefreshCw } from 'lucide-react';

interface StatsData {
  month: string;
  stats: {
    totalIncome: number;
    totalExpense: number;
    categoryBreakdown: Record<string, number>;
  };
  accounts: { _id: string; name: string; type: string; balance: number; currency: string }[];
  persons: { _id: string; name: string; aliases: string[]; accounts: string[]; netBalance: number }[];
}

export default function App() {
  const [data, setData] = useState<StatsData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'persons' | 'export'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setError(`Failed to fetch stats (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
      setError(err.message || 'Network error while loading stats');
    } finally {
      setLoading(false);
    }
  };

  const sanitizeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    let str = String(val).trim();
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['Account Name', 'Type', 'Balance'],
      ...data.accounts.map(a => [a.name, a.type, a.balance])
    ];
    const csvContent = rows.map(r => r.map(sanitizeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Finance_AI_Export_${data.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const netSavings = (data?.stats.totalIncome || 0) - (data?.stats.totalExpense || 0);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
            ⚡
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Finance AI Mini App</h1>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Cloudflare Workers AI • Multi-Account Telegram Bot</p>
          </div>
        </div>

        <button onClick={fetchStats} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.25rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setActiveTab('overview')} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: activeTab === 'overview' ? '#3b82f6' : 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <PieChart size={16} /> Overview
        </button>
        <button onClick={() => setActiveTab('accounts')} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: activeTab === 'accounts' ? '#3b82f6' : 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Wallet size={16} /> Accounts
        </button>
        <button onClick={() => setActiveTab('persons')} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: activeTab === 'persons' ? '#3b82f6' : 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Users size={16} /> Ledger
        </button>
        <button onClick={() => setActiveTab('export')} style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', background: activeTab === 'export' ? '#3b82f6' : 'transparent', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Download size={16} /> Export
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Total Income <ArrowDownLeft size={16} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                Rs. {(data?.stats.totalIncome || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Total Expense <ArrowUpRight size={16} color="#ef4444" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                Rs. {(data?.stats.totalExpense || 0).toLocaleString()}
              </div>
            </div>

            <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Net Position <ShieldCheck size={16} color="#3b82f6" />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6', marginTop: '0.25rem' }}>
                Rs. {netSavings.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Category Meters */}
          <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Category Breakdown</h3>
            {data?.stats.categoryBreakdown && Object.keys(data.stats.categoryBreakdown).length > 0 ? (
              Object.entries(data.stats.categoryBreakdown).map(([cat, amt]) => {
                const pct = data.stats.totalExpense > 0 ? Math.round((amt / data.stats.totalExpense) * 100) : 0;
                return (
                  <div key={cat} style={{ marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <span>{cat}</span>
                      <span style={{ fontWeight: 600 }}>Rs. {amt.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '9999px' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No expense records available yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'accounts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {data?.accounts.map(acc => (
            <div key={acc._id} style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.25rem' }}>{acc.name}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>Rs. {acc.balance.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'persons' && (
        <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Counterparty Ledger</h3>
          {data?.persons.map(p => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{p.aliases.join(', ')}</div>
              </div>
              <div style={{ fontWeight: 600, color: p.netBalance > 0 ? '#10b981' : p.netBalance < 0 ? '#ef4444' : '#9ca3af' }}>
                {p.netBalance > 0 ? `Owes +Rs. ${p.netBalance.toLocaleString()}` : p.netBalance < 0 ? `You owe -Rs. ${Math.abs(p.netBalance).toLocaleString()}` : 'Settled'}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'export' && (
        <div style={{ background: 'rgba(22, 31, 47, 0.7)', border: '1px solid rgba(255,255,255,0.08)', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
          <Download size={36} color="#3b82f6" style={{ marginBottom: '1rem' }} />
          <h3>Export Financial Records</h3>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0.5rem 0 1.5rem 0' }}>
            Download your itemized monthly balances and counterparty ledger as CSV.
          </p>
          <button onClick={exportCsv} style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Download CSV Export
          </button>
        </div>
      )}
    </div>
  );
}
