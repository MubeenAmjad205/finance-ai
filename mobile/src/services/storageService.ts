import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncLogEntry {
  id: string;
  sender: string;
  body: string;
  status: 'success' | 'failed' | 'queued';
  timestamp: string;
  responseMsg?: string;
}

const DEFAULT_WEBHOOK_URL = 'https://finance-ai.mianmubeen205.workers.dev/api/sms/webhook';
const KEYS = {
  WEBHOOK_URL: 'finance_ai_webhook_url',
  SECRET_TOKEN: 'finance_ai_secret_token',
  SYNC_LOGS: 'finance_ai_sync_logs',
  IS_LISTENER_ACTIVE: 'finance_ai_listener_active'
};

export class StorageService {
  static async getWebhookUrl(): Promise<string> {
    try {
      const val = await AsyncStorage.getItem(KEYS.WEBHOOK_URL);
      return val || DEFAULT_WEBHOOK_URL;
    } catch {
      return DEFAULT_WEBHOOK_URL;
    }
  }

  static async setWebhookUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.WEBHOOK_URL, url.trim());
  }

  static async getSecretToken(): Promise<string> {
    try {
      const val = await AsyncStorage.getItem(KEYS.SECRET_TOKEN);
      return val || '';
    } catch {
      return '';
    }
  }

  static async setSecretToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.SECRET_TOKEN, token.trim());
  }

  static async isListenerActive(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(KEYS.IS_LISTENER_ACTIVE);
      return val !== 'false';
    } catch {
      return true;
    }
  }

  static async setListenerActive(active: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.IS_LISTENER_ACTIVE, String(active));
  }

  static async getSyncLogs(): Promise<SyncLogEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SYNC_LOGS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static async addSyncLog(entry: SyncLogEntry): Promise<void> {
    try {
      const current = await this.getSyncLogs();
      const updated = [entry, ...current].slice(0, 50); // Keep last 50 logs
      await AsyncStorage.setItem(KEYS.SYNC_LOGS, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save log:', err);
    }
  }

  static async clearLogs(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.SYNC_LOGS);
  }
}
