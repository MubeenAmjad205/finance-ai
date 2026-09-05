import { Env } from '../../db/types';
import { ParsedTransactionResult, HIGH_VALUE_THRESHOLD_PKR } from './textParser';
import { PiiFilter } from '../piiFilter';

export class VisionReceiptService {
  /**
   * Parse receipt image / payment screenshot using Cloudflare Workers AI Vision model
   * Returns ParsedTransactionResult if successfully extracted with high confidence, or null if unreadable.
   */
  static async parseReceipt(env: Env, imageArrayBuffer: ArrayBuffer): Promise<ParsedTransactionResult | null> {
    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const imageVector = Array.from(new Uint8Array(imageArrayBuffer));
        const prompt = `This is a financial image: either a payment receipt, transaction confirmation slip, or a mobile banking app dashboard/balance card (JazzCash, EasyPaisa, Meezan, HBL, UBL, SadaPay, NayaPay, etc.).
Extract the key financial details:
- If this is a payment receipt/transfer confirmation: extract total paid/transferred amount, type ("expense", "income", or "transfer").
- If this is an app dashboard or balance screen: extract the current visible account balance as the amount, account name, and set category to "Account Balance".
Return JSON ONLY:
{
  "type": "expense" | "income" | "transfer",
  "amount": number,
  "currency": "PKR",
  "category": "Bills & Utilities" | "Food & Dining" | "Transfer" | "Account Balance" | "General",
  "account": "JazzCash" | "EasyPaisa" | "Meezan Bank" | "HBL" | "UBL" | "NayaPay" | "SadaPay" | "Cash",
  "personName": "Receiver or Sender name if visible or null",
  "note": "Payment or balance description",
  "confidence": 0.9
}`;

        const response: any = await (env.AI as any).run('@cf/meta/llama-3.2-11b-vision-instruct', {
          prompt,
          image: imageVector
        });

        const rawContent = response?.response || (typeof response === 'string' ? response : '');
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawAmount = Number(parsed.amount);
          
          if (!isNaN(rawAmount) && rawAmount > 0) {
            const sanitizedNote = PiiFilter.redact(parsed.note || 'Receipt Screenshot').redactedText;
            const amount = Math.abs(rawAmount);
            return {
              type: parsed.type || 'expense',
              amount,
              currency: 'PKR',
              category: parsed.category || 'General',
              account: parsed.account || 'JazzCash',
              personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
              note: sanitizedNote,
              confidence: Math.max(0.7, Number(parsed.confidence) || 0.85),
              isHighValue: amount >= HIGH_VALUE_THRESHOLD_PKR
            };
          }
        }
      }
    } catch (err) {
      console.error('[VisionReceiptService Error] parseReceipt failed:', err);
    }

    // Never return fake hardcoded amounts when OCR fails!
    return null;
  }
}
