import axios, { AxiosInstance, AxiosError } from 'axios';
import { HelkiTokenManager } from './HelkiTokenManager';
import {
  HelkiDevice,
  HelkiDevicesResponse,
  HelkiNode,
  HelkiNodesResponse,
  HelkiNodeStatus,
  HelkiRawNodeStatus,
  HelkiAwayStatus,
  parseNodeStatus,
} from './types';

const DEFAULT_API_BASE = 'https://api-hjm.helki.com';

export class HelkiApiClient {
  private client: AxiosInstance;
  private tokenManager: HelkiTokenManager;
  private refreshPromise: Promise<string> | null = null;
  private readonly apiBase: string;

  constructor(apiBase: string = DEFAULT_API_BASE) {
    this.apiBase = apiBase;
    this.tokenManager = new HelkiTokenManager(apiBase);

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
          originalRequest
        ) {
          if (!this.refreshPromise) {
            this.tokenManager.invalidate();
            this.refreshPromise = this.tokenManager.refresh().finally(() => {
              this.refreshPromise = null;
            });
          }
          const token = await this.refreshPromise;
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return this.client.request(originalRequest);
        }
        throw this.translateError(error);
      }
    );
  }

  getApiBase(): string {
    return this.apiBase;
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
    const response = await this.client.get<HelkiDevicesResponse>(
      '/api/v2/devs',
      { headers }
    );
    // Real API wraps devices in { devs: [...], invited_to: [...] }
    return response.data.devs;
  }

  async getNodes(deviceId: string): Promise<HelkiNode[]> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiNodesResponse>(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/mgr/nodes`,
      { headers }
    );
    // Real API wraps nodes in { nodes: [...] }
    return response.data.nodes;
  }

  async getNodeStatus(
    deviceId: string,
    nodeType: string,
    nodeAddr: number
  ): Promise<HelkiNodeStatus> {
    const headers = await this.authHeaders();
    const response = await this.client.get<HelkiRawNodeStatus>(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/${encodeURIComponent(nodeType)}/${encodeURIComponent(String(nodeAddr))}/status`,
      { headers }
    );
    // Parse string temperatures to numbers
    const parsed = parseNodeStatus(response.data);
    return parsed as HelkiNodeStatus;
  }

  async setNodeStatus(
    deviceId: string,
    nodeType: string,
    nodeAddr: number,
    status: Partial<HelkiNodeStatus>
  ): Promise<void> {
    const headers = await this.authHeaders();
    // Convert numeric temps back to strings for the API
    const apiStatus: Record<string, unknown> = {};
    if (status.stemp !== undefined) {
      apiStatus.stemp = String(status.stemp);
    }
    if (status.mtemp !== undefined) {
      apiStatus.mtemp = String(status.mtemp);
    }
    if (status.mode !== undefined) {
      apiStatus.mode = status.mode;
    }
    if (status.active !== undefined) {
      apiStatus.active = status.active;
    }
    await this.client.post(
      `/api/v2/devs/${encodeURIComponent(deviceId)}/${encodeURIComponent(nodeType)}/${encodeURIComponent(String(nodeAddr))}/status`,
      apiStatus,
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
