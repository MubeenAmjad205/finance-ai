import { WebhookService } from './webhookService';
import { StorageService, SyncLogEntry } from './storageService';

export const SAMPLE_BANK_SMS = [
  {
    bank: 'UBL Bank',
    sender: 'UBL',
    body: 'Dear Customer, Rs. 1,500.00 debited from AC ****1234 on 08-Sep-26 at IMTIAZ SUPERMARKET. Avail Bal PKR 45,000'
  },
  {
    bank: 'Askari Bank',
    sender: 'Askari',
    body: 'Txn of PKR 2,500.00 processed on Askari Card ****5678 at SHELL PETROL. Available Limit PKR 85,000'
  },
  {
    bank: 'Mashreq Neo',
    sender: 'Mashreq',
    body: 'Debit Alert: PKR 3,800.00 spent on Mashreq Neo Card ****9012 at Amazon'
  },
  {
    bank: 'JazzCash',
    sender: 'JazzCash',
    body: 'Trx ID 987654321: Paid Rs 500.00 to Foodpanda from JazzCash Account. Balance Rs 12,000'
  },
  {
    bank: 'EasyPaisa',
    sender: 'EasyPaisa',
    body: 'Rs 350.00 transferred to 03001234567. Remaining balance Rs 4,500'
  }
];

export class SmsListenerManager {
  /**
   * Process incoming raw SMS text and send if sender is from a supported bank/wallet
   */
  static async handleIncomingSms(sender: string, body: string): Promise<SyncLogEntry | null> {
    const isActive = await StorageService.isListenerActive();
    if (!isActive) return null;

    const lowerSender = (sender || '').toLowerCase();
    const lowerBody = (body || '').toLowerCase();

    const isBankSms =
      lowerSender.includes('ubl') ||
      lowerSender.includes('askari') ||
      lowerSender.includes('mashreq') ||
      lowerSender.includes('jazzcash') ||
      lowerSender.includes('easypaisa') ||
      lowerSender.includes('meezan') ||
      lowerSender.includes('hbl') ||
      lowerBody.includes('debited') ||
      lowerBody.includes('credited') ||
      lowerBody.includes('trx id');

    if (isBankSms) {
      return await WebhookService.sendAlert(sender, body);
    }

    return null;
  }
}
