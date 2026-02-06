export interface HelkiDevice {
  dev_id: string;
  name: string;
  connected: boolean;
}

export interface HelkiNode {
  addr: string;
  name: string;
  type: 'htr' | 'thm' | 'acm';
}

export interface HelkiNodeStatus {
  stemp: number;   // Sensor (current) temperature
  mtemp: number;   // Manual (target) temperature
  mode: string;    // off, manual, auto, self_learn, presence
  active: boolean; // Whether the heater is currently heating
}

export interface HelkiTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface HelkiCredentials {
  username: string;
  password: string;
}

export interface HelkiAwayStatus {
  away: boolean;
  enabled: boolean;
}

export interface DeviceData {
  deviceId: string;
  nodeType: string;
  nodeAddr: string;
  name: string;
}

export interface HelkiSocketUpdate {
  dev_id: string;
  nodes?: Array<{
    addr: string;
    type: string;
    status?: Partial<HelkiNodeStatus>;
  }>;
}
