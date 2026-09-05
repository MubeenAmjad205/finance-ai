interface RateLimitEntry {
  attempts: number;
  firstAttemptTime: number;
  lockedUntil?: number;
}

export class LoginRateLimiter {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

  private static memoryStore = new Map<string, RateLimitEntry>();

  /**
   * Check if an IP/key is currently locked out
   */
  static isLockedOut(key: string): { locked: boolean; retryAfterSeconds?: number } {
    const entry = this.memoryStore.get(key);
    if (!entry) return { locked: false };

    const now = Date.now();

    // Check active lockout
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return { locked: true, retryAfterSeconds };
    }

    // Reset expired window
    if (now - entry.firstAttemptTime > this.WINDOW_MS) {
      this.memoryStore.delete(key);
      return { locked: false };
    }

    return { locked: false };
  }

  /**
   * Record a failed passcode attempt
   */
  static recordFailure(key: string): { locked: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const now = Date.now();
    let entry = this.memoryStore.get(key);

    if (!entry || now - entry.firstAttemptTime > this.WINDOW_MS) {
      entry = {
        attempts: 1,
        firstAttemptTime: now
      };
      this.memoryStore.set(key, entry);
      return { locked: false, remainingAttempts: this.MAX_ATTEMPTS - 1 };
    }

    entry.attempts += 1;

    if (entry.attempts >= this.MAX_ATTEMPTS) {
      entry.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      return {
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil(this.LOCKOUT_DURATION_MS / 1000)
      };
    }

    return {
      locked: false,
      remainingAttempts: this.MAX_ATTEMPTS - entry.attempts
    };
  }

  /**
   * Clear failed attempts upon successful login
   */
  static recordSuccess(key: string): void {
    this.memoryStore.delete(key);
  }

  /**
   * Cleanup older keys periodically to keep memory lightweight
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.lockedUntil && entry.lockedUntil < now && now - entry.firstAttemptTime > this.WINDOW_MS) {
        this.memoryStore.delete(key);
      }
    }
  }
}
