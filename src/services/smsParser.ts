import { ParsedTransactionResult } from './ai/textParser';
import { MerchantRegistry } from './merchantRegistry';
import { AccountService } from './accountService';
import { PiiFilter } from './piiFilter';

export class SmsParserService {
  /**
   * Parse Bank / Mobile Wallet SMS Alert into a structured ParsedTransactionResult
   */
  static parseSms(sender: string, smsBody: string): ParsedTransactionResult | null {
    if (!smsBody || typeof smsBody !== 'string') return null;

    const lowerBody = smsBody.toLowerCase();
    const lowerSender = (sender || '').toLowerCase();

    // 1. Detect Account / Bank Name
    let account = 'Cash';
    if (lowerSender.includes('ubl') || lowerBody.includes('ubl')) account = 'UBL';
    else if (lowerSender.includes('askari') || lowerSender.includes('8870') || lowerBody.includes('askari') || lowerBody.includes('akbl')) account = 'Askari Bank';
    else if (lowerSender.includes('mashreq') || lowerBody.includes('mashreq')) account = 'Mashreq Neo';
    else if (lowerSender.includes('jazzcash') || lowerBody.includes('jazzcash')) account = 'JazzCash';
    else if (lowerSender.includes('easypaisa') || lowerBody.includes('easypaisa')) account = 'EasyPaisa';
    else if (lowerSender.includes('meezan') || lowerBody.includes('meezan')) account = 'Meezan Bank';
    else if (lowerSender.includes('hbl') || lowerBody.includes('hbl')) account = 'HBL';
    else {
      const detected = AccountService.detectAccount(smsBody);
      if (detected) account = detected.name;
    }

    // 2. Detect Transaction Type
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    const isIncome = /\b(credited|received|received from|deposit|deposited|inflow|salary|cashback|refund)\b/i.test(lowerBody);
    const isExpense = /\b(debited|spent|paid|purchase|processed|sent|sent to|transfer to|transferred to)\b/i.test(lowerBody);

    if (isIncome && !isExpense) {
      type = 'income';
    }

    // 3. Extract Amount (Strip Trx ID & reference numbers first)
    const cleanTextForAmount = smsBody.replace(/(?:trx|transaction|ref|reference|auth|id)\s*(?:id|num|no|#)?\s*:?\s*\d+/gi, '');
    const amountMatch = cleanTextForAmount.match(/(?:rs\.?|pkr|aed|usd|\$)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);
    let amount = 0;
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return null;
    }

    // 4. Detect Merchant & Category
    const detectedMerchant = MerchantRegistry.detectMerchant(smsBody);
    const category = detectedMerchant ? detectedMerchant.category : (type === 'income' ? 'Salary' : 'General');
    const merchantName = detectedMerchant ? detectedMerchant.merchantName : undefined;

    const sanitizedNote = PiiFilter.redact(smsBody.length > 80 ? smsBody.substring(0, 80) + '...' : smsBody).redactedText;

    return {
      type,
      amount,
      currency: 'PKR',
      category,
      account,
      note: merchantName ? `SMS Alert: ${merchantName}` : `SMS Alert: ${sanitizedNote}`,
      confidence: 0.95,
      isHighValue: amount >= 50000
    };
  }
}
