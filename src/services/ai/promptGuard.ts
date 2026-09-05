export interface PromptSanitizationResult {
  sanitizedText: string;
  hasInjectionAttempt: boolean;
  detectedPatterns: string[];
}

export class PromptGuard {
  private static readonly INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules|commands)/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
    /you\s+are\s+now\s+(dan|jailbroken|unrestricted|godmode|developer\s+mode)/gi,
    /bypass\s+(all\s+)?safety\s+(filters|guidelines|protocols)/gi,
    /override\s+(system|developer)\s+(prompt|instructions|settings)/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
    /<\|system\|>/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<<SYS>>/gi,
    /<\/sys>>/gi,
    /<\/?system>/gi,
    /<\/?prompt>/gi,
    /role\s*:\s*["']?system["']?/gi
  ];

  /**
   * Sanitizes user-provided text to neutralize prompt injection attacks
   * @param input Raw text message from user
   */
  static sanitize(input: string): PromptSanitizationResult {
    if (!input || typeof input !== 'string') {
      return { sanitizedText: '', hasInjectionAttempt: false, detectedPatterns: [] };
    }

    let sanitized = input;
    const detectedPatterns: string[] = [];

    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        detectedPatterns.push(pattern.source);
        // Replace malicious phrase with neutral safe text
        sanitized = sanitized.replace(pattern, '[FILTERED_INPUT]');
      }
    }

    // Also strip unescaped control characters and null bytes
    sanitized = sanitized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    return {
      sanitizedText: sanitized.trim(),
      hasInjectionAttempt: detectedPatterns.length > 0,
      detectedPatterns
    };
  }
}
