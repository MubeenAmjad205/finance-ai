export type TransactionType = 'expense' | 'income' | 'transfer' | 'debt_given' | 'debt_received';

export type TransactionStatus = 'pending_confirmation' | 'confirmed' | 'rejected';

export interface Transaction {
  _id?: string;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  account: string; // e.g. "JazzCash", "EasyPaisa", "NayaPay", "Meezan Bank", "Cash", etc.
  personId?: string;
  personName?: string;
  note: string;
  rawText: string;
  status: TransactionStatus;
  timestamp: string; // ISO 8601 string
  telegramMessageId?: number;
  telegramUserId?: number;
  createdAt?: string;
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

export interface Env {
  AI: any; // Cloudflare Workers AI Binding
  ENVIRONMENT?: string;
  DEFAULT_CURRENCY?: string;
  ENABLE_AUTO_OCR?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_SECRET_TOKEN?: string;
  MONGODB_DATA_API_KEY?: string;
  MONGODB_APP_ID?: string;
  MONGODB_DATABASE?: string;
  MONGODB_DATA_SOURCE?: string;
  DASHBOARD_PASSCODE?: string;
}
