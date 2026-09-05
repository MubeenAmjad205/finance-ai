export interface TemporalContext {
  isoDate: string;        // "2026-09-05"
  dayOfWeek: string;      // "Saturday"
  timeString: string;     // "05:30 AM PKT"
  monthName: string;      // "September"
  year: number;           // 2026
  promptContext: string;  // Detailed string for LLM injection
}

export interface ResolvedDateReference {
  isoDate: string;        // "2026-09-04"
  dayOfWeek: string;      // "Friday"
  label: string;          // "Friday (Sep 4, 2026)"
  isPast: boolean;
}

export class TemporalResolver {
  private static readonly DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /**
   * Get formatted Pakistani timezone temporal context
   */
  static getCurrentContext(refDate = new Date()): TemporalContext {
    // Offset for Pakistan Standard Time (UTC+5)
    const pktTime = new Date(refDate.getTime() + 5 * 60 * 60 * 1000);
    
    const year = pktTime.getUTCFullYear();
    const month = String(pktTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(pktTime.getUTCDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    const dayOfWeek = this.DAYS[pktTime.getUTCDay()];
    const monthName = pktTime.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const hours = pktTime.getUTCHours();
    const minutes = String(pktTime.getUTCMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const timeString = `${formattedHours}:${minutes} ${ampm} PKT`;

    const promptContext = `CURRENT TEMPORAL CONTEXT:
- Today's Date: ${isoDate} (${monthName} ${day}, ${year})
- Day of the Week: ${dayOfWeek}
- Current Local Time: ${timeString}
- Timezone: Asia/Karachi (PKT, UTC+5)`;

    return {
      isoDate,
      dayOfWeek,
      timeString,
      monthName,
      year,
      promptContext
    };
  }

  /**
   * Resolve day names like "Friday", "yesterday", "Saturday night" to exact ISO dates
   */
  static resolveDate(text: string, refDate = new Date()): ResolvedDateReference | null {
    const lower = text.toLowerCase();
    const current = this.getCurrentContext(refDate);
    const pktTime = new Date(refDate.getTime() + 5 * 60 * 60 * 1000);

    // 1. Check "yesterday" / "kal"
    if (lower.includes('yesterday') || lower.includes('kal')) {
      const yesterday = new Date(pktTime.getTime() - 24 * 60 * 60 * 1000);
      const yDate = yesterday.toISOString().substring(0, 10);
      const yDay = this.DAYS[yesterday.getUTCDay()];
      return {
        isoDate: yDate,
        dayOfWeek: yDay,
        label: `Yesterday (${yDay})`,
        isPast: true
      };
    }

    // 2. Check "today" / "aaj"
    if (lower.includes('today') || lower.includes('aaj')) {
      return {
        isoDate: current.isoDate,
        dayOfWeek: current.dayOfWeek,
        label: `Today (${current.dayOfWeek})`,
        isPast: false
      };
    }

    // 3. Check Day of Week mentions ("Friday", "Saturday", "Monday", etc.)
    for (let targetDayIdx = 0; targetDayIdx < this.DAYS.length; targetDayIdx++) {
      const dayName = this.DAYS[targetDayIdx];
      const dayLower = dayName.toLowerCase();

      if (lower.includes(dayLower)) {
        const currentDayIdx = pktTime.getUTCDay();
        let diff = currentDayIdx - targetDayIdx;
        if (diff <= 0) {
          diff += 7; // Look at most recent past occurrence of that day
        }
        // If user says "dinner on Saturday night" on Saturday itself, diff is 0
        if (currentDayIdx === targetDayIdx) {
          diff = 0;
        }

        const targetTime = new Date(pktTime.getTime() - diff * 24 * 60 * 60 * 1000);
        const targetIso = targetTime.toISOString().substring(0, 10);

        return {
          isoDate: targetIso,
          dayOfWeek: dayName,
          label: `${dayName} (${targetIso})`,
          isPast: diff > 0
        };
      }
    }

    return null;
  }

  /**
   * Cryptographic HMAC-SHA256 Evidence Hash for Database Records
   * Used to detect manual direct tampering inside MongoDB Atlas
   */
  static async generateEvidenceSignature(
    record: { amount: number; timestamp: string; account?: string; note?: string; paidBy?: any },
    secretKey = 'finance_ai_integrity_key'
  ): Promise<string> {
    const rawPayload = `${record.amount}|${record.timestamp}|${record.account || ''}|${record.note || ''}|${JSON.stringify(record.paidBy || '')}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const msgData = encoder.encode(rawPayload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Verify signature against a record and explicit stored hash
   */
  static async verifyEvidenceSignature(
    record: { amount: number; timestamp: string; account?: string; note?: string; paidBy?: any },
    storedHash: string,
    secretKey = 'finance_ai_integrity_key'
  ): Promise<boolean> {
    const expectedHash = await this.generateEvidenceSignature(record, secretKey);
    return expectedHash === storedHash;
  }

  /**
   * Verify whether a database record's fields match its stored HMAC signature
   */
  static async verifyRecordIntegrity(
    record: any,
    secretKey = 'finance_ai_integrity_key'
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (!record.evidenceHash) {
      // Legacy records without hash
      return { isValid: true };
    }

    const isValid = await this.verifyEvidenceSignature(record, record.evidenceHash, secretKey);
    if (!isValid) {
      return {
        isValid: false,
        reason: `🚨 Security Alert: Record #${record._id || 'unknown'} has been manually altered directly in the database! (Stored HMAC signature mismatch)`
      };
    }

    return { isValid: true };
  }
}
