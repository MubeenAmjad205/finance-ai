import { MongoDBClient } from '../../db/mongodb';
import { getUserCurrentMonth, formatUserDateTime, DEFAULT_USER_TIMEZONE } from '../../utils/timezone';

export class ExportCommands {
  static async handleExport(
    db: MongoDBClient,
    args: string,
    chatId?: number,
    botToken?: string
  ): Promise<string> {
    const rawMonth = args.trim();
    const currentMonth = getUserCurrentMonth(DEFAULT_USER_TIMEZONE);
    const targetMonth = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonth;

    // Fetch transactions
    const transactions = await db.getTransactionsByMonth(targetMonth);

    if (transactions.length === 0) {
      return `ℹ️ No transactions found for period \`${targetMonth}\`. Nothing to export.`;
    }

    // Build CSV
    const headers = [
      'Date',
      'Type',
      'Category',
      'Amount_PKR',
      'Original_Amount',
      'Original_Currency',
      'Exchange_Rate',
      'Account',
      'Person',
      'Note',
      'Status',
      'Evidence_Hash'
    ];

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = transactions.map(tx => [
      escapeCsv(tx.timestamp ? formatUserDateTime(tx.timestamp, DEFAULT_USER_TIMEZONE) : ''),
      escapeCsv(tx.type),
      escapeCsv(tx.category),
      escapeCsv(tx.amount),
      escapeCsv(tx.originalAmount || ''),
      escapeCsv(tx.originalCurrency || 'PKR'),
      escapeCsv(tx.exchangeRate || 1),
      escapeCsv(tx.account),
      escapeCsv(tx.personName || ''),
      escapeCsv(tx.note || tx.rawText || ''),
      escapeCsv(tx.status),
      escapeCsv(tx.evidenceHash || '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

    // If botToken and chatId are present, upload as document file to Telegram
    if (botToken && chatId) {
      try {
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        formData.append('caption', `📊 **Financial Statement Export: ${targetMonth}**\n• Records: ${transactions.length}\n• Income: ${totalIncome.toLocaleString()} PKR\n• Expenses: ${totalExpenses.toLocaleString()} PKR\n🔒 *Cryptographically secured records.*`);
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        formData.append('document', blob, `finance_statement_${targetMonth}.csv`);

        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          return `✅ **Statement CSV Exported and Sent Above!**\nMonth: \`${targetMonth}\` (${transactions.length} records).`;
        }
      } catch (err) {
        console.error('[Export CSV Upload Error]:', err);
      }
    }

    // Fallback if document upload fails or not in direct message: render markdown summary & snippet
    return `📊 **Financial Export for ${targetMonth}**\n──────────────────────\n` +
      `📁 **Total Records:** ${transactions.length}\n` +
      `💵 **Total Income:** ${totalIncome.toLocaleString()} PKR\n` +
      `💸 **Total Expenses:** ${totalExpenses.toLocaleString()} PKR\n\n` +
      `*CSV Preview (First 5 records):*\n\`\`\`csv\n` +
      headers.join(',') + '\n' +
      rows.slice(0, 5).join('\n') +
      `\n\`\`\``;
  }
}
