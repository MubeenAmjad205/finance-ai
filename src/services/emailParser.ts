import { ParsedTransactionResult } from './ai/textParser';
import { SmsParserService } from './smsParser';

export class EmailParserService {
  /**
   * Parse Bank / Wallet Email Alert into a structured ParsedTransactionResult
   */
  static parseEmail(from: string, subject: string, emailBody: string): ParsedTransactionResult | null {
    const combinedContent = `${subject || ''} ${emailBody || ''}`;
    return SmsParserService.parseSms(from || 'Bank Email', combinedContent);
  }
}
