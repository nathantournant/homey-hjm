import axios, { AxiosInstance, AxiosError } from 'axios';
import { HelkiTokenManager } from './HelkiTokenManager';
import {
  HelkiDevice,
  HelkiNode,
  HelkiNodeStatus,
  HelkiAwayStatus,
} from './types';

// TODO: Confirm these values by sniffing HJM app traffic
const DEFAULT_API_BASE = 'https://api-hjm.helki.com';
const DEFAULT_BASIC_AUTH = 'PLACEHOLDER_BASE64_CREDENTIALS';

export class HelkiApiClient {
  private client: AxiosInstance;
  private tokenManager: HelkiTokenManager;
  private isRefreshing = false;

  constructor(
    apiBase: string = DEFAULT_API_BASE,
    basicAuth: string = DEFAULT_BASIC_AUTH
  ) {
    this.tokenManager = new HelkiTokenManager(apiBase, basicAuth);

    this.client = axios.create({
      baseURL: apiBase,
      timeout: 15000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !this.isRefreshing
        ) {
          this.isRefreshing = true;
          try {
            this.tokenManager.invalidate();
            const token = await this.tokenManager.refresh();
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return this.client.request(originalRequest);
          } finally {
            this.isRefreshing = false;
          }
        }
        throw this.translateError(error);
      }
    );
  }

  async authenticate(username: string, password: string): Promise<void> {
    await this.tokenManager.authenticate(username, password);
  }

  isAuthenticated(): boolean {
    return this.tokenManager.isAuthenticated();
  }

  getTokenManager(): HelkiTokenManager {
    return this.tokenManager;
  }

  private translateError(error: AxiosError): Error {
    if (error.response?.status === 401) {
      return new Error('Invalid credentials. Check your HJM app login.');
    }
    if (error.response?.status === 429) {
      return new Error('Too many requests. Please wait a moment.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new Error(
        'Could not connect to HJM cloud. Check your internet.'
      );
    }
    return new Error(`HJM API error: ${error.message}`);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.tokenManager.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  async getDevices(): Promise<HelkiDevice[]> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiDevice[]>('/api/v2/devs', {
      headers,
    });
    return response.data;
  }

  async getNodes(deviceId: string): Promise<HelkiNode[]> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiNode[]>(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/mgr/nodes`,
      { headers }
    );
    return response.data;
  }

  async getNodeStatus(
    deviceId: string,
    nodeType: string,
    nodeAddr: string
  ): Promise<HelkiNodeStatus> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiNodeStatus>(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/${encodeURIComponent(nodeType)}/${encodeURIComponent(nodeAddr)}/status`,
      { headers }
    );
    return response.data;
  }

  async setNodeStatus(
    deviceId: string,
    nodeType: string,
    nodeAddr: string,
    status: Partial<HelkiNodeStatus>
  ): Promise<void> {
    const headers = await this.authHeaders();
    await this.client.post(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/${encodeURIComponent(nodeType)}/${encodeURIComponent(nodeAddr)}/status`,
      status,
      { headers }
    );
  }

  async getAwayStatus(deviceId: string): Promise<HelkiAwayStatus> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiAwayStatus>(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/mgr/away_status`,
      { headers }
    );
    return response.data;
  }

  async setAwayStatus(
    deviceId: string,
    status: HelkiAwayStatus
  ): Promise<void> {
    const headers = await this.authHeaders();
    await this.client.put(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/mgr/away_status`,
      status,
      { headers }
    );
  }
}
