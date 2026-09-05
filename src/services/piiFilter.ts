export class PiiFilter {
  // Pakistani CNIC: 5 digits - 7 digits - 1 digit, or contiguous 13 digits
  private static readonly CNIC_PATTERN = /\b\d{5}[-\s]?\d{7}[-\s]?\d{1}\b/g;

  // 16-digit Payment Card PAN (with optional dashes/spaces)
  private static readonly CARD_PAN_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

  // CVV / CVC (3-4 digits preceded by cvv/cvc label)
  private static readonly CVV_PATTERN = /\b(?:cvv|cvc|security\s*code)[\s:=]*([0-9]{3,4})\b/gi;

  // OTP or PIN (4-6 digits preceded by otp/pin label)
  private static readonly OTP_PATTERN = /\b(?:otp|one\s*time\s*password|pin\s*code|verification\s*code)[\s:=]*([0-9]{4,6})\b/gi;

  /**
   * Redact sensitive personal identity and banking credentials from text
   */
  static redact(text: string): { redactedText: string; hasRedactions: boolean } {
    if (!text || typeof text !== 'string') {
      return { redactedText: '', hasRedactions: false };
    }

    let modified = text;
    let hasRedactions = false;

    // 1. Redact CNIC
    if (this.CNIC_PATTERN.test(modified)) {
      modified = modified.replace(this.CNIC_PATTERN, (match) => {
        hasRedactions = true;
        return '[CNIC_REDACTED]';
      });
    }

    // 2. Redact Card PAN (Check length and avoid simple phone numbers or timestamps)
    if (this.CARD_PAN_PATTERN.test(modified)) {
      modified = modified.replace(this.CARD_PAN_PATTERN, (match) => {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length === 16) {
          hasRedactions = true;
          return `[CARD_XXXX-XXXX-XXXX-${digitsOnly.slice(-4)}]`;
        }
        return match;
      });
    }

    // 3. Redact CVV
    if (this.CVV_PATTERN.test(modified)) {
      modified = modified.replace(this.CVV_PATTERN, () => {
        hasRedactions = true;
        return 'CVV: [REDACTED]';
      });
    }

    // 4. Redact OTP / PIN
    if (this.OTP_PATTERN.test(modified)) {
      modified = modified.replace(this.OTP_PATTERN, () => {
        hasRedactions = true;
        return 'OTP: [REDACTED]';
      });
    }

    return {
      redactedText: modified,
      hasRedactions
    };
  }
}
