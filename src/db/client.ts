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

  constructor(env: Env) {
    const rawKey = env.MONGODB_DATA_API_KEY || '';
    const rawUri = env.MONGODB_URI || '';

    this.apiKey = rawKey;
    this.appId = env.MONGODB_APP_ID || '';
    this.databaseName = env.MONGODB_DATABASE || 'finance_db';
    this.dataSource = env.MONGODB_DATA_SOURCE || 'Cluster0';

    this.baseUrl = `https://data.mongodb-api.com/app/${this.appId}/endpoint/data/v1`;
    this.isConfigured = Boolean((rawKey && !rawKey.startsWith('mongodb')) || rawUri);
  }

  /**
   * Execute an action against the MongoDB Atlas Data API.
   */
  async execute<T = any>(action: string, collection: string, payload: Record<string, any> = {}): Promise<T | null> {
    if (!this.isConfigured || !this.apiKey || this.apiKey.startsWith('mongodb')) {
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
        return null;
      }

      return (await response.json()) as T;
    } catch (err: any) {
      console.error(`[MongoDB Atlas Data API Exception] ${action}:`, err.message || err);
      return null;
    }
  }
}
