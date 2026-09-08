import { StorageService, SyncLogEntry } from './storageService';

export class WebhookService {
  /**
   * Post captured Bank SMS or App Notification Alert to live Worker API
   */
  static async sendAlert(sender: string, smsBody: string): Promise<SyncLogEntry> {
    const webhookUrl = await StorageService.getWebhookUrl();
    const secretToken = await StorageService.getSecretToken();

    const logId = `log_${Date.now()}`;
    const timestamp = new Date().toISOString();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (secretToken) {
        headers['X-Telegram-Bot-Api-Secret-Token'] = secretToken;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sender,
          body: smsBody,
          timestamp
        })
      });

      const resData: any = await response.json();

      if (response.ok && (resData.status === 'success' || resData.status === 'ok' || resData.status === 'ignored')) {
        const entry: SyncLogEntry = {
          id: logId,
          sender,
          body: smsBody,
          status: 'success',
          timestamp,
          responseMsg: resData.parsed ? `Logged ${resData.parsed.amount} PKR (${resData.parsed.account})` : resData.message || 'Processed'
        };
        await StorageService.addSyncLog(entry);
        return entry;
      } else {
        const entry: SyncLogEntry = {
          id: logId,
          sender,
          body: smsBody,
          status: 'failed',
          timestamp,
          responseMsg: resData.message || `HTTP ${response.status}`
        };
        await StorageService.addSyncLog(entry);
        return entry;
      }
    } catch (err: any) {
      const entry: SyncLogEntry = {
        id: logId,
        sender,
        body: smsBody,
        status: 'failed',
        timestamp,
        responseMsg: err.message || 'Network Connection Error'
      };
      await StorageService.addSyncLog(entry);
      return entry;
    }
  }
}
