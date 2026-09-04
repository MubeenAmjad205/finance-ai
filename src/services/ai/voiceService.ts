import { Env } from '../../db/types';

export class VoiceTranscriptionService {
  /**
   * Transcribe Voice Note Audio Buffer using Cloudflare Workers AI Whisper Model (@cf/openai/whisper)
   */
  static async transcribe(env: Env, audioBuffer: ArrayBuffer): Promise<string> {
    try {
      if (env.AI && typeof (env.AI as any).run === 'function') {
        // Use Uint8Array directly if supported, with safe fallback
        const uint8 = new Uint8Array(audioBuffer);
        
        let audioInput: any = uint8;
        try {
          // Some Workers AI environments prefer direct typed array or number array
          const response: any = await (env.AI as any).run('@cf/openai/whisper', {
            audio: audioInput
          });
          const text = response?.text || (typeof response === 'string' ? response : '');
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        } catch (innerErr) {
          // If typed array fails, fallback to Array.from for backward compatibility
          const audioVector = Array.from(uint8);
          const response: any = await (env.AI as any).run('@cf/openai/whisper', {
            audio: audioVector
          });
          const text = response?.text || (typeof response === 'string' ? response : '');
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        }
      }
    } catch (err) {
      console.error('[VoiceTranscriptionService Error] Voice transcription failed:', err);
    }
    return '';
  }
}
