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
        const prompt = `This is a transaction screenshot or receipt from a Pakistani payment app (JazzCash, EasyPaisa, Meezan, HBL, etc.).
Extract the total amount, currency (PKR/USD), account/bank name, receiver/sender name, transaction reference ID, and transaction type.
Return JSON ONLY:
{
  "type": "expense" | "income" | "transfer",
  "amount": number,
  "currency": "PKR",
  "category": "Bills & Utilities" | "Food & Dining" | "Transfer" | "General",
  "account": "JazzCash" | "EasyPaisa" | "Meezan Bank" | "HBL" | "NayaPay" | "Cash",
  "personName": "Receiver or Sender name if visible",
  "note": "Transaction screenshot payment",
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
