export interface RaastPaymentRequest {
  receiverTitle: string;
  ibanOrMobile: string; // Raast ID (e.g. mobile number 03001234567 or IBAN)
  amount?: number;
  note?: string;
}

export class RaastQrService {
  /**
   * Format standard Raast Payment URI link
   */
  static generatePaymentLink(req: RaastPaymentRequest): string {
    const cleanId = req.ibanOrMobile.replace(/[^0-9A-Za-z]/g, '');
    const amountStr = req.amount && req.amount > 0 ? `&amount=${req.amount}` : '';
    const noteStr = req.note ? `&note=${encodeURIComponent(req.note)}` : '';
    const titleStr = encodeURIComponent(req.receiverTitle);

    return `raast://pay?id=${cleanId}&title=${titleStr}${amountStr}${noteStr}`;
  }

  /**
   * Generate an EMVCo compliant Raast payload string for QR generation
   * Standard EMVCo Tag-Length-Value (TLV) structure used by Pakistani banks
   */
  static generateEmvCoPayload(req: RaastPaymentRequest): string {
    const cleanId = req.ibanOrMobile.replace(/[^0-9A-Za-z]/g, '');
    
    // Tag 00: Payload Format Indicator (01)
    let payload = '000201';
    // Tag 01: Point of Initiation Method (12 = Dynamic QR if amount set, 11 = Static)
    payload += req.amount ? '010212' : '010211';
    
    // Tag 26: Raast Merchant Account Information
    const subTag00 = '0005PK.RA';
    const subTag01 = `01${String(cleanId.length).padStart(2, '0')}${cleanId}`;
    const tag26Value = subTag00 + subTag01;
    payload += `26${String(tag26Value.length).padStart(2, '0')}${tag26Value}`;

    // Tag 52: Merchant Category Code (0000 = General)
    payload += '52040000';
    // Tag 53: Transaction Currency (586 = PKR ISO 4217 code)
    payload += '5303586';

    // Tag 54: Transaction Amount
    if (req.amount && req.amount > 0) {
      const amtStr = req.amount.toFixed(2);
      payload += `54${String(amtStr.length).padStart(2, '0')}${amtStr}`;
    }

    // Tag 58: Country Code (PK)
    payload += '5802PK';
    // Tag 59: Merchant/Receiver Name
    const cleanName = req.receiverTitle.slice(0, 25);
    payload += `59${String(cleanName.length).padStart(2, '0')}${cleanName}`;
    // Tag 60: Merchant City (Karachi / Islamabad default)
    payload += '6007Karachi';

    // Tag 63: CRC16 placeholder
    payload += '6304';
    const crc = this.calculateCrc16(payload);
    return payload + crc;
  }

  /**
   * Calculate CRC16-CCITT checksum for EMVCo
   */
  private static calculateCrc16(data: string): string {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Helper to get public QR image rendering URL
   */
  static getQrImageUrl(emvcoPayload: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(emvcoPayload)}`;
  }
}
