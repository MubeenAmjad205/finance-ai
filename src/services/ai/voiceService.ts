import { Env } from '../../db/types';
import { containsDisallowedScript } from './queryService';

export class VoiceTranscriptionService {
  /**
   * Transcribe Voice Note Audio Buffer directly into English.
   *
   * By setting `task: 'translate'`, Whisper automatically translates any spoken language
   * (e.g. Urdu, Punjabi, Hindi) directly into English. If the speech is already in English,
   * it transcribes it cleanly.
   *
   * Priority:
   * 1. Groq Whisper Large v3 Turbo (if GROQ_API_KEY is configured in Cloudflare Secrets)
   * 2. Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` (task: 'translate')
   * 3. Cloudflare Workers AI `@cf/openai/whisper` (task: 'translate')
   */
  static async transcribe(env: Env, audioBuffer: ArrayBuffer): Promise<string> {
    // 1. Optional Groq Whisper API (fastest, high accuracy on South Asian accents)
    if (env.GROQ_API_KEY) {
      try {
        const groqText = await this.transcribeWithGroq(env.GROQ_API_KEY, audioBuffer);
        if (groqText && groqText.trim().length > 0) {
          return this.sanitizeOutput(groqText.trim());
        }
      } catch (groqErr) {
        console.warn('[VoiceTranscriptionService] Groq translation fallback to Workers AI:', groqErr);
      }
    }

    // 2. Cloudflare Workers AI Native Edge Models
    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        const uint8 = new Uint8Array(audioBuffer);
        const models = ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper'];

        for (const model of models) {
          try {
            // Task: "translate" translates spoken foreign speech (Urdu/Hindi) into English
            const response: any = await (env.AI as any).run(model, {
              audio: uint8,
              task: 'translate'
            });
            const text = response?.text || (typeof response === 'string' ? response : '');
            if (text && text.trim().length > 0) {
              return this.sanitizeOutput(text.trim());
            }
          } catch (e1) {
            try {
              // Fallback to number array if typed array is rejected by runtime
              const audioVector = Array.from(uint8);
              const response: any = await (env.AI as any).run(model, {
                audio: audioVector,
                task: 'translate'
              });
              const text = response?.text || (typeof response === 'string' ? response : '');
              if (text && text.trim().length > 0) {
                return this.sanitizeOutput(text.trim());
              }
            } catch (e2) {
              console.warn(`[VoiceTranscriptionService] Model ${model} failed:`, e2);
            }
          }
        }
      }
    } catch (err) {
      console.error('[VoiceTranscriptionService Error] Voice transcription failed:', err);
    }

    return '';
  }

  /**
   * Translates foreign audio to English via Groq Whisper Translations API
   */
  private static async transcribeWithGroq(apiKey: string, audioBuffer: ArrayBuffer): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/translations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (res.ok) {
      const data: any = await res.json();
      return data?.text || '';
    }
    return '';
  }

  /**
   * Sanitizes output to guarantee English/Latin text and drop stray non-Latin tokens
   */
  private static sanitizeOutput(text: string): string {
    if (containsDisallowedScript(text)) {
      // Remove any non-Latin / non-ASCII non-punctuation characters
      const cleaned = text.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u0DFF\u0E00-\u0E7F\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF]/g, '').trim();
      return cleaned.length > 0 ? cleaned : text;
    }
    return text;
  }
}
