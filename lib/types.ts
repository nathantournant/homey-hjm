// ── API Response Wrappers ──
// The Helki API wraps collections in named objects

export interface HelkiDevicesResponse {
  devs: HelkiDevice[];
  invited_to: HelkiDevice[];
}

export interface HelkiNodesResponse {
  nodes: HelkiNode[];
}

// ── Device & Node Models ──
// Based on real Helki API shapes (see: github.com/ajtudela/smartbox)

export interface HelkiDevice {
  dev_id: string;
  name: string;
  product_id?: string;
  fw_version?: string;
  serial_id?: string;
}

export type HelkiNodeType = 'htr' | 'thm' | 'acm' | 'htr_mod' | 'pmo';

export interface HelkiNode {
  addr: number;       // Integer in the real API
  name: string;
  type: HelkiNodeType;
  installed?: boolean;
  lost?: boolean;
}

// ── Node Status ──
// IMPORTANT: The real API returns temperatures as STRINGS (e.g. "21.5")
// Our parsing layer converts them to numbers for Homey capabilities.

export interface HelkiRawNodeStatus {
  stemp: string;              // Sensor (current) temperature - STRING
  mtemp: string;              // Manual (target) temperature - STRING
  mode: string;               // off, manual, auto, self_learn, presence
  active: boolean;            // Whether the heater is currently heating
  units: string;              // Temperature units (e.g. "C")
  sync_status: string;
  error_code: string;
  locked: boolean;
  presence: boolean;
  window_open: boolean;
  boost: boolean;
  true_radiant_active: boolean;
  eco_temp: string;
  comf_temp: string;
  ice_temp: string;
  power: string;
  duty: number;
  act_duty: number;
  pcb_temp: string;
  power_pcb_temp: string;
  boost_end_min: number;
  boost_end_day: number;
}

// Parsed status with numeric temperatures, used by our device layer
export interface HelkiNodeStatus {
  stemp: number;
  mtemp: number;
  mode: string;
  active: boolean;
  locked?: boolean;
  presence?: boolean;
  window_open?: boolean;
  boost?: boolean;
}

// ── Authentication ──

export interface HelkiTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface HelkiCredentials {
  username: string;
  password: string;
}

// ── Away Status ──

export interface HelkiAwayStatus {
  away: boolean;
  enabled: boolean;
  forced?: boolean;
}

// ── Device Data (stored per paired Homey device) ──

export interface DeviceData {
  deviceId: string;
  nodeType: string;
  nodeAddr: number;
  name: string;
}

// ── Socket.io Updates ──
// Temperatures arrive as strings in socket updates too

export interface HelkiSocketUpdate {
  nodes?: Array<{
    addr: number;
    type: string;
    status?: Partial<HelkiRawNodeStatus>;
    setup?: Record<string, unknown>;
  }>;
  away_status?: string;
  connected?: boolean;
}

// ── Parsing Utilities ──

export function parseNodeStatus(raw: Partial<HelkiRawNodeStatus>): Partial<HelkiNodeStatus> {
  const parsed: Partial<HelkiNodeStatus> = {};

  if (raw.stemp !== undefined) {
    parsed.stemp = parseFloat(raw.stemp);
  }
  if (raw.mtemp !== undefined) {
    parsed.mtemp = parseFloat(raw.mtemp);
  }
  if (raw.mode !== undefined) {
    parsed.mode = raw.mode;
  }
  if (raw.active !== undefined) {
    parsed.active = raw.active;
  }
  if (raw.locked !== undefined) {
    parsed.locked = raw.locked;
  }
  if (raw.presence !== undefined) {
    parsed.presence = raw.presence;
  }
  if (raw.window_open !== undefined) {
    parsed.window_open = raw.window_open;
  }
  if (raw.boost !== undefined) {
    parsed.boost = raw.boost;
  }

  return parsed;
}
