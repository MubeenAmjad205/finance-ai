import { Env } from './types';

/**
 * Robust, lightweight HTTP Client for MongoDB Atlas Data API on Cloudflare Workers.
 */
export class MongoDBAtlasClient {
  private apiKey: string;
  private appId: string;
  private databaseName: string;
  private dataSource: string;
  private baseUrl: string;
  public readonly isConfigured: boolean;
  public lastError: string | null = null;

  constructor(env: Env) {
    const rawKey = env.MONGODB_DATA_API_KEY || '';
    const rawUri = env.MONGODB_URI || '';

    this.apiKey = rawKey;
    this.appId = env.MONGODB_APP_ID || '';
    this.databaseName = env.MONGODB_DATABASE || 'finance_db';
    this.dataSource = env.MONGODB_DATA_SOURCE || 'Cluster0';

    if (env.MONGODB_DATA_API_URL) {
      this.baseUrl = env.MONGODB_DATA_API_URL.replace(/\/+$/, '');
    } else {
      this.baseUrl = `https://data.mongodb-api.com/app/${this.appId}/endpoint/data/v1`;
    }
    this.isConfigured = Boolean((rawKey && !rawKey.startsWith('mongodb')) || rawUri);
  }

  /**
   * Execute an action against the MongoDB Atlas Data API.
   */
  async execute<T = any>(action: string, collection: string, payload: Record<string, any> = {}): Promise<T | null> {
    if (!this.isConfigured || !this.apiKey || this.apiKey.startsWith('mongodb')) {
      this.lastError = 'MongoDB credentials not configured or using unsupported native connection URI.';
      return null;
    }

    const url = `${this.baseUrl}/action/${action}`;
    const body = {
      dataSource: this.dataSource,
      database: this.databaseName,
      collection,
      ...payload
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Request-Headers': '*',
          'api-key': this.apiKey
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[MongoDB Atlas Data API] Action "${action}" on collection "${collection}" failed [${response.status}]:`, errText);
        this.lastError = `HTTP ${response.status}: ${errText}`;
        return null;
      }

      this.lastError = null;
      return (await response.json()) as T;
    } catch (err: any) {
      console.error(`[MongoDB Atlas Data API Exception] ${action}:`, err.message || err);
      this.lastError = err?.message || 'Network fetch failure';
      return null;
    }
  }
}
