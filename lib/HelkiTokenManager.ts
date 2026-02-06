import axios, { AxiosError } from 'axios';
import { HelkiTokenResponse, HelkiCredentials } from './types';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// App-level OAuth client credentials for the Helki API (from HJM app)
const HELKI_BASIC_AUTH = 'aGptLWFwcDo='; // base64("hjm-app:")

export class HelkiTokenManager {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private credentials: HelkiCredentials | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(private readonly apiBase: string) {}

  async authenticate(username: string, password: string): Promise<string> {
    this.credentials = { username, password };
    return this.fetchToken();
  }

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    return this.refresh();
  }

  async refresh(): Promise<string> {
    // Deduplicate concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.fetchToken().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  setCredentials(credentials: HelkiCredentials): void {
    this.credentials = credentials;
  }

  invalidate(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    if (!this.credentials) {
      throw new Error('No credentials available. Please log in first.');
    }

    try {
      const response = await axios.post<HelkiTokenResponse>(
        `${this.apiBase}/api/v2/client/token`,
        {
          username: this.credentials.username,
          password: this.credentials.password,
        },
        {
          headers: { Authorization: `Basic ${HELKI_BASIC_AUTH}` },
          timeout: 15000,
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt =
        Date.now() + response.data.expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS;

      return this.accessToken;
    } catch (error) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;

      if (error instanceof AxiosError) {
        if (error.response?.status === 401) {
          throw new Error('Invalid credentials. Check your HJM app login.');
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw new Error(
            'Could not connect to HJM cloud. Check your internet.'
          );
        }
      }
      throw error;
    }
  }
}
