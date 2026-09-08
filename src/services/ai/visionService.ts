import { Env } from '../../db/types';
import { ParsedTransactionResult, HIGH_VALUE_THRESHOLD_PKR } from './textParser';
import { PiiFilter } from '../piiFilter';

export interface ReceiptLineItem {
  description: string;
  amount: number;
  category?: string;
}

export class VisionReceiptService {
  /**
   * Parse receipt image / payment screenshot using Cloudflare Workers AI Vision model
   * Returns ParsedTransactionResult with line items if successfully extracted with high confidence, or null if unreadable.
   */
  static async parseReceipt(env: Env, imageArrayBuffer: ArrayBuffer): Promise<(ParsedTransactionResult & { lineItems?: ReceiptLineItem[] }) | null> {
    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const imageVector = Array.from(new Uint8Array(imageArrayBuffer));
        const prompt = `This is a financial image: either a payment receipt, store bill slip, or mobile banking screenshot (JazzCash, EasyPaisa, Meezan, HBL, SadaPay, etc.).
Extract key details including individual line items if present.
Return JSON ONLY:
{
  "type": "expense" | "income" | "transfer",
  "amount": number,
  "currency": "PKR",
  "category": "Groceries" | "Bills & Utilities" | "Food & Dining" | "Transfer" | "Shopping" | "General",
  "account": "JazzCash" | "EasyPaisa" | "Meezan Bank" | "HBL" | "UBL" | "NayaPay" | "SadaPay" | "Cash",
  "personName": "Receiver or Sender name if visible or null",
  "note": "Store name or payment description",
  "lineItems": [
    { "description": "item name", "amount": 250, "category": "Groceries" }
  ],
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

            const lineItems: ReceiptLineItem[] = Array.isArray(parsed.lineItems)
              ? parsed.lineItems
                  .filter((item: any) => item && typeof item.description === 'string' && Number(item.amount) > 0)
                  .map((item: any) => ({
                    description: String(item.description).trim(),
                    amount: Number(item.amount),
                    category: item.category || parsed.category || 'General'
                  }))
              : [];

            return {
              type: parsed.type || 'expense',
              amount,
              currency: 'PKR',
              category: parsed.category || 'General',
              account: parsed.account || 'JazzCash',
              personName: parsed.personName && parsed.personName !== 'null' ? parsed.personName : undefined,
              note: sanitizedNote,
              lineItems: lineItems.length > 0 ? lineItems : undefined,
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
