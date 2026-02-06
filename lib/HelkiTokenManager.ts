import axios, { AxiosError } from 'axios';
import { HelkiTokenResponse, HelkiCredentials } from './types';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// OAuth client credentials for the Smartbox/Helki API (from smartbox Python lib)
const HELKI_BASIC_AUTH = 'NTRiY2NiZmI0MWE5YTUxMTNmMDQ4OGQwOnZkaXZkaQ==';

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
    return this.accessToken !== null && Date.now() < this.tokenExpiresAt;
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
      const params = new URLSearchParams();
      params.append('grant_type', 'password');
      params.append('username', this.credentials.username);
      params.append('password', this.credentials.password);

      const response = await axios.post<HelkiTokenResponse>(
        `${this.apiBase}/client/token`,
        params,
        {
          headers: {
            Authorization: `Basic ${HELKI_BASIC_AUTH}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
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
