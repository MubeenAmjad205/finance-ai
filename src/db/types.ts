import type { Ai } from '@cloudflare/workers-types';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'debt_given' | 'debt_received' | 'group_split' | 'set_balance';

export type TransactionStatus = 'pending_confirmation' | 'confirmed' | 'rejected';

export interface Transaction {
  _id?: string;
  type: TransactionType;
  amount: number; // Amount in PKR
  originalAmount?: number; // Original foreign currency amount (if applicable)
  originalCurrency?: string; // e.g. "USD", "EUR", "AED", "SAR"
  exchangeRate?: number; // Conversion rate to PKR
  currency: string; // Default: "PKR"
  category: string;
  account: string; // e.g. "JazzCash", "EasyPaisa", "NayaPay", "Meezan Bank", "Cash", etc.
  personId?: string;
  personName?: string;
  note: string;
  rawText: string;
  status: TransactionStatus;
  timestamp: string; // ISO 8601 string
  telegramMessageId?: number;
  telegramUserId?: string | number;
  isVoiceNote?: boolean;
  voiceTranscription?: string;
  isRecurring?: boolean;
  isHighValue?: boolean;
  splitPayments?: { account: string; amount: number }[];
  evidenceHash?: string; // HMAC-SHA256 tamper-detection signature
  tags?: string[]; // e.g. ["#TaxDeductible", "#Freelance"]
  createdAt?: string;
}

export interface GroupSplit {
  _id?: string;
  title: string;
  totalAmount: number;
  paidByPersonId?: string;
  paidByPersonName: string;
  participants: {
    personId?: string;
    personName: string;
    shareAmount: number;
    hasPaid: boolean;
  }[];
  timestamp: string;
  createdAt: string;
}

export interface RecurringBill {
  _id?: string;
  title: string;
  amount: number;
  category: string;
  account: string;
  dueDayOfMonth: number; // 1 - 31
  autoNotify: boolean;
  lastPaidTimestamp?: string;
}

export interface BudgetCap {
  _id?: string;
  category: string;
  monthlyLimit: number;
  alertThresholdPct: number; // e.g. 80 for 80%
  updatedAt?: string;
}

export interface Reminder {
  _id?: string;
  text: string;
  chatId?: string | number;
  dueAt?: string;
  isTriggered: boolean;
  createdAt: string;
}

export interface SavingsGoal {
  _id?: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  updatedAt: string;
  createdAt: string;
}

export interface Person {
  _id?: string;
  name: string;
  aliases: string[]; // e.g., ["Ali", "Ali K", "Ali Khan"]
  accounts: string[]; // e.g., ["JazzCash", "Meezan Bank"]
  netBalance: number; // positive: person owes user, negative: user owes person
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  _id?: string;
  name: string; // e.g. "JazzCash", "EasyPaisa", "NayaPay", "SadaPay", "Meezan Bank", "HBL", "Cash"
  type: 'mobile_wallet' | 'bank' | 'cash' | 'card';
  balance: number;
  currency: string;
  updatedAt: string;
}

export interface MergeProposal {
  _id?: string;
  primaryPersonId: string;
  primaryName: string;
  targetPersonId: string;
  targetName: string;
  suggestedAlias: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export type GroupAuditAction = 
  | 'BILL_LOGGED' 
  | 'MARKED_PAID' 
  | 'EXPENSE_UNDONE' 
  | 'SETTLEMENT_RECORDED' 
  | 'BALANCE_OVERRIDDEN' 
  | 'STATEMENT_IMPORTED'
  | 'MESSAGE_EDITED'
  | 'MANUAL_DB_TAMPER_DETECTED';

export interface KametiMember {
  name: string;
  payoutMonth: number; // Month index 1..totalMonths when this person takes the pot
  payoutReceived: boolean;
  paidMonths: number[]; // e.g. [1, 2]
}

export interface Kameti {
  _id?: string;
  name: string; // e.g. "Office Monthly Kameti"
  monthlyAmount: number; // Contribution amount per member per month
  totalMonths: number;
  startDate: string; // ISO date string
  currentMonth: number; // 1..totalMonths
  members: KametiMember[];
  status: 'active' | 'completed';
  createdAt: string;
}

export interface WhitelistEntry {
  _id?: string;
  userId: string;
  username?: string;
  firstName?: string;
  addedBy: string;
  role?: string;
  chatType: 'personal' | 'group' | 'manual';
  createdAt: string;
}

export interface GroupAuditLog {
  _id?: string;
  groupId: number | string;
  groupTitle?: string;
  timestamp: string;
  action: GroupAuditAction;
  actor: {
    userId?: number;
    username?: string;
    name: string;
  };
  expenseId?: string;
  details: {
    totalAmount?: number;
    note?: string;
    paidBy?: string;
    participants?: string[];
    previousState?: any;
    newState?: any;
  };
  rawTelegramText?: string;
  telegramMessageId?: number;
  evidenceHash: string; // SHA-256 HMAC digest
  createdAt: string;
}

export interface Env {
  AI?: Ai; // Typed Cloudflare Workers AI Binding
  ENVIRONMENT?: string;
  DEFAULT_CURRENCY?: string;
  USER_TIMEZONE?: string; // e.g. "Asia/Karachi" (default)
  ENABLE_AUTO_OCR?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_GROUP_BOT_TOKEN?: string;
  TELEGRAM_SECRET_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string; // For scheduled notifications
  TELEGRAM_ALLOWED_USER_IDS?: string; // Comma-separated allowed Telegram user/chat IDs
  DATABASE_URL?: string;
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  MONGODB_DATA_API_KEY?: string;
  MONGODB_URI?: string;
  MONGODB_APP_ID?: string;
  MONGODB_DATABASE?: string;
  MONGODB_DATA_SOURCE?: string;
  MONGODB_DATA_API_URL?: string;
  DASHBOARD_PASSCODE?: string;
}
