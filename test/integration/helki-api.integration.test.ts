/**
 * Integration tests for the Helki API.
 *
 * These tests hit the REAL Helki API and require valid credentials.
 * They are skipped by default and only run when env vars are set:
 *
 *   HELKI_USERNAME=your@email.com HELKI_PASSWORD=yourpassword npm run test:integration
 *
 * Optional env vars:
 *   HELKI_API_BASE  - API host (default: https://api-hjm.helki.com)
 */

import { HelkiApiClient } from '../../lib/HelkiApiClient';
import { HelkiDevice, HelkiNode, HelkiNodeStatus } from '../../lib/types';

const HELKI_USERNAME = process.env.HELKI_USERNAME;
const HELKI_PASSWORD = process.env.HELKI_PASSWORD;
const HELKI_API_BASE = process.env.HELKI_API_BASE || 'https://api-hjm.helki.com';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(!!HELKI_USERNAME && !!HELKI_PASSWORD)(
  'Helki API Integration',
  () => {
    let client: HelkiApiClient;

    beforeAll(async () => {
      client = new HelkiApiClient(HELKI_API_BASE);
      await client.authenticate(HELKI_USERNAME!, HELKI_PASSWORD!);
    });

    it('should authenticate successfully', () => {
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should list devices', async () => {
      const devices = await client.getDevices();
      expect(Array.isArray(devices)).toBe(true);
      console.log('Devices found:', devices.length);

      for (const device of devices) {
        expect(device.dev_id).toBeDefined();
        expect(device.name).toBeDefined();
        console.log(`  - ${device.name} (${device.dev_id})`);
      }
    });

    it('should list nodes for each device', async () => {
      const devices = await client.getDevices();

      for (const device of devices) {
        const nodes = await client.getNodes(device.dev_id);
        expect(Array.isArray(nodes)).toBe(true);
        console.log(`Nodes for ${device.name}:`, nodes.length);

        for (const node of nodes) {
          expect(typeof node.addr).toBe('number');
          expect(node.type).toBeDefined();
          console.log(`  - ${node.name} (type: ${node.type}, addr: ${node.addr})`);
        }
      }
    });

    it('should get status for heater nodes with numeric temperatures', async () => {
      const devices = await client.getDevices();

      for (const device of devices) {
        const nodes = await client.getNodes(device.dev_id);
        const heaters = nodes.filter((n) => n.type === 'htr');

        for (const heater of heaters) {
          const status = await client.getNodeStatus(
            device.dev_id,
            heater.type,
            heater.addr
          );

          // Verify parsing worked: should be numbers, not strings
          expect(typeof status.stemp).toBe('number');
          expect(typeof status.mtemp).toBe('number');
          expect(status.mode).toBeDefined();
          expect(!isNaN(status.stemp)).toBe(true);
          expect(!isNaN(status.mtemp)).toBe(true);

          console.log(
            `  ${heater.name}: ${status.mtemp}°C (target: ${status.stemp}°C, mode: ${status.mode})`
          );
        }
      }
    });

    it('should refresh token after invalidation', async () => {
      // Force token invalidation
      client.getTokenManager().invalidate();
      expect(client.isAuthenticated()).toBe(false);

      // Next API call should auto-refresh
      const devices = await client.getDevices();
      expect(Array.isArray(devices)).toBe(true);
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should get away status for first device', async () => {
      const devices = await client.getDevices();
      if (devices.length === 0) {
        console.log('No devices found, skipping away status test');
        return;
      }

      const awayStatus = await client.getAwayStatus(devices[0].dev_id);
      expect(typeof awayStatus.away).toBe('boolean');
      expect(typeof awayStatus.enabled).toBe('boolean');
      console.log(`Away status for ${devices[0].name}:`, awayStatus);
    });

    it('should throw on invalid device ID', async () => {
      await expect(
        client.getNodes('non-existent-device-12345')
      ).rejects.toThrow();
    });

    it('should handle no-op setNodeStatus (write current value back)', async () => {
      const devices = await client.getDevices();
      if (devices.length === 0) return;

      const nodes = await client.getNodes(devices[0].dev_id);
      const heater = nodes.find((n) => n.type === 'htr');
      if (!heater) return;

      const status = await client.getNodeStatus(
        devices[0].dev_id,
        heater.type,
        heater.addr
      );

      // Write the same mode back — should be a no-op
      await client.setNodeStatus(devices[0].dev_id, heater.type, heater.addr, {
        mode: status.mode,
      });

      // Verify unchanged
      const statusAfter = await client.getNodeStatus(
        devices[0].dev_id,
        heater.type,
        heater.addr
      );
      expect(statusAfter.mode).toBe(status.mode);
    });
  }
);

// ── Complex Multi-Action User Flows ──
// These tests simulate realistic user workflows involving multiple
// sequential API operations, mirroring what happens during actual
// Homey device usage.
//
// Safety: A global snapshot of all heater statuses + away statuses is
// captured in beforeAll. Each mutating test also uses try/finally to
// attempt per-test cleanup. If anything slips through, afterAll does a
// best-effort restore of the entire environment.
//
// Note: The Helki cloud API has propagation delay — a write may return
// 200 before the device acknowledges it. We use waitForStatus() to
// poll until the expected value appears (or timeout).

// Longer timeout for integration tests that hit a real API
const INTEGRATION_TIMEOUT = 30_000;

interface HeaterSnapshot {
  deviceId: string;
  nodeType: string;
  nodeAddr: number;
  status: HelkiNodeStatus;
}

interface AwaySnapshot {
  deviceId: string;
  away: import('../../lib/types').HelkiAwayStatus;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll getNodeStatus until the predicate returns true or the timeout expires.
 * Returns the last status read. Throws if predicate never passes.
 */
async function waitForStatus(
  client: HelkiApiClient,
  deviceId: string,
  nodeType: string,
  nodeAddr: number,
  predicate: (s: HelkiNodeStatus) => boolean,
  timeoutMs = 8000,
  intervalMs = 1500
): Promise<HelkiNodeStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: HelkiNodeStatus | null = null;
  while (Date.now() < deadline) {
    last = await client.getNodeStatus(deviceId, nodeType, nodeAddr);
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  // Return last status even if predicate didn't pass — let the caller assert
  return last!;
}

/**
 * Poll getAwayStatus until the predicate returns true or the timeout expires.
 */
async function waitForAway(
  client: HelkiApiClient,
  deviceId: string,
  predicate: (a: import('../../lib/types').HelkiAwayStatus) => boolean,
  timeoutMs = 8000,
  intervalMs = 1500
): Promise<import('../../lib/types').HelkiAwayStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: import('../../lib/types').HelkiAwayStatus | null = null;
  while (Date.now() < deadline) {
    last = await client.getAwayStatus(deviceId);
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  return last!;
}

/** Helper: find the first heater node across all devices */
async function findFirstHeater(
  client: HelkiApiClient
): Promise<{ device: HelkiDevice; heater: HelkiNode } | null> {
  const devices = await client.getDevices();
  for (const device of devices) {
    const nodes = await client.getNodes(device.dev_id);
    const heater = nodes.find((n) => n.type === 'htr');
    if (heater) return { device, heater };
  }
  return null;
}

/** Helper: collect all heater nodes across all devices */
async function findAllHeaters(
  client: HelkiApiClient
): Promise<Array<{ device: HelkiDevice; heater: HelkiNode }>> {
  const devices = await client.getDevices();
  const results: Array<{ device: HelkiDevice; heater: HelkiNode }> = [];
  for (const device of devices) {
    const nodes = await client.getNodes(device.dev_id);
    for (const node of nodes) {
      if (node.type === 'htr') {
        results.push({ device, heater: node });
      }
    }
  }
  return results;
}

/** Best-effort restore: swallow errors so one failed restore doesn't block others */
async function safeRestore(
  client: HelkiApiClient,
  heaterSnapshots: HeaterSnapshot[],
  awaySnapshots: AwaySnapshot[]
): Promise<void> {
  const errors: string[] = [];

  for (const snap of heaterSnapshots) {
    try {
      await client.setNodeStatus(snap.deviceId, snap.nodeType, snap.nodeAddr, {
        mode: snap.status.mode,
        stemp: snap.status.stemp,
      });
    } catch (e) {
      errors.push(
        `Failed to restore heater ${snap.nodeType}/${snap.nodeAddr} on ${snap.deviceId}: ${e}`
      );
    }
  }

  for (const snap of awaySnapshots) {
    try {
      await client.setAwayStatus(snap.deviceId, snap.away);
    } catch (e) {
      errors.push(`Failed to restore away status for ${snap.deviceId}: ${e}`);
    }
  }

  if (errors.length > 0) {
    console.warn('  [afterAll] Some restores failed:\n    ' + errors.join('\n    '));
  }
}

describeIf(!!HELKI_USERNAME && !!HELKI_PASSWORD)(
  'Complex User Flows',
  () => {
    let client: HelkiApiClient;

    // Global snapshots captured before any mutating test runs
    const heaterSnapshots: HeaterSnapshot[] = [];
    const awaySnapshots: AwaySnapshot[] = [];

    beforeAll(async () => {
      client = new HelkiApiClient(HELKI_API_BASE);
      await client.authenticate(HELKI_USERNAME!, HELKI_PASSWORD!);

      // Snapshot every heater's status and every device's away status
      const devices = await client.getDevices();
      for (const device of devices) {
        // Away status
        try {
          const away = await client.getAwayStatus(device.dev_id);
          awaySnapshots.push({ deviceId: device.dev_id, away });
        } catch {
          // Device may not support away status — skip
        }

        // Heater statuses
        const nodes = await client.getNodes(device.dev_id);
        for (const node of nodes) {
          if (node.type === 'htr') {
            const status = await client.getNodeStatus(
              device.dev_id, node.type, node.addr
            );
            heaterSnapshots.push({
              deviceId: device.dev_id,
              nodeType: node.type,
              nodeAddr: node.addr,
              status,
            });
          }
        }
      }

      console.log(
        `  [beforeAll] Captured snapshot: ${heaterSnapshots.length} heater(s), ` +
        `${awaySnapshots.length} away status(es)`
      );
    });

    afterAll(async () => {
      // Best-effort restore of the entire environment from the snapshot
      console.log('  [afterAll] Restoring environment from snapshot...');
      await safeRestore(client, heaterSnapshots, awaySnapshots);
      console.log('  [afterAll] Restore complete');
    });

    // ── Flow 1: Full device discovery (pairing simulation) ──
    // Read-only: no mutations, no cleanup needed
    it('should complete full device discovery flow', async () => {
      const devices = await client.getDevices();
      expect(devices.length).toBeGreaterThan(0);

      const discoveredHeaters: Array<{
        deviceId: string;
        deviceName: string;
        heaterName: string;
        nodeType: string;
        nodeAddr: number;
        status: HelkiNodeStatus;
      }> = [];

      for (const device of devices) {
        const nodes = await client.getNodes(device.dev_id);
        const heaters = nodes.filter((n) => n.type === 'htr');

        for (const heater of heaters) {
          const status = await client.getNodeStatus(
            device.dev_id, heater.type, heater.addr
          );
          discoveredHeaters.push({
            deviceId: device.dev_id,
            deviceName: device.name,
            heaterName: heater.name,
            nodeType: heater.type,
            nodeAddr: heater.addr,
            status,
          });
        }
      }

      expect(discoveredHeaters.length).toBeGreaterThan(0);
      for (const h of discoveredHeaters) {
        expect(typeof h.status.stemp).toBe('number');
        expect(typeof h.status.mtemp).toBe('number');
        expect(h.status.mode).toBeDefined();
        expect(h.nodeType).toBe('htr');
        console.log(
          `  Discovered: ${h.heaterName} on ${h.deviceName} — ` +
          `${h.status.mtemp}°C / target ${h.status.stemp}°C / mode ${h.status.mode}`
        );
      }
    });

    // ── Flow 2: Set temperature then verify ──
    it('should set target temperature and read it back', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const original = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      const originalTemp = original.stemp;
      console.log(`  Original target temp: ${originalTemp}°C`);

      const newTemp = originalTemp === 20 ? 20.5 : 20;
      try {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: original.mode,
          stemp: newTemp,
        });
        console.log(`  Set target temp to: ${newTemp}°C`);

        const updated = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.stemp === newTemp
        );
        expect(updated.stemp).toBe(newTemp);
        console.log(`  Verified target temp: ${updated.stemp}°C`);
      } finally {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: original.mode,
          stemp: originalTemp,
        }).catch((e) => console.warn(`  [cleanup] restore temp failed: ${e}`));
      }

      const restored = await waitForStatus(
        client, device.dev_id, heater.type, heater.addr,
        (s) => s.stemp === originalTemp
      );
      expect(restored.stemp).toBe(originalTemp);
      console.log(`  Restored target temp: ${restored.stemp}°C`);
    }, INTEGRATION_TIMEOUT);

    // ── Flow 3: Set mode then verify ──
    it('should set mode and read it back', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const original = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      const originalMode = original.mode;
      console.log(`  Original mode: ${originalMode}`);

      const newMode = originalMode === 'manual' ? 'auto' : 'manual';
      try {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: newMode,
          stemp: original.stemp,
        });
        console.log(`  Set mode to: ${newMode}`);

        const updated = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.mode === newMode
        );
        expect(updated.mode).toBe(newMode);
        console.log(`  Verified mode: ${updated.mode}`);
      } finally {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: originalMode,
          stemp: original.stemp,
        }).catch((e) => console.warn(`  [cleanup] restore mode failed: ${e}`));
      }

      const restored = await waitForStatus(
        client, device.dev_id, heater.type, heater.addr,
        (s) => s.mode === originalMode
      );
      expect(restored.mode).toBe(originalMode);
      console.log(`  Restored mode: ${restored.mode}`);
    }, INTEGRATION_TIMEOUT);

    // ── Flow 4: Multi-action step — set mode AND temperature together ──
    it('should set mode and temperature in sequence', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const original = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      console.log(
        `  Original: mode=${original.mode}, target=${original.stemp}°C`
      );

      const nightTemp = original.stemp - 1;

      try {
        // Step 1: Set mode+temp together (combined call)
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: 'manual',
          stemp: nightTemp,
        });

        const afterCombined = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.mode === 'manual' && s.stemp === nightTemp
        );
        expect(afterCombined.mode).toBe('manual');
        expect(afterCombined.stemp).toBe(nightTemp);
        console.log(
          `  After combined set: mode=${afterCombined.mode}, target=${afterCombined.stemp}°C`
        );

        // Step 2: Change just the temp (with mode included for API compat)
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: 'manual',
          stemp: nightTemp + 0.5,
        });

        const afterSecond = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.stemp === nightTemp + 0.5
        );
        expect(afterSecond.stemp).toBe(nightTemp + 0.5);
        console.log(
          `  After second set: mode=${afterSecond.mode}, target=${afterSecond.stemp}°C`
        );
      } finally {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: original.mode,
          stemp: original.stemp,
        }).catch((e) => console.warn(`  [cleanup] restore mode+temp failed: ${e}`));
      }

      const restored = await waitForStatus(
        client, device.dev_id, heater.type, heater.addr,
        (s) => s.mode === original.mode && s.stemp === original.stemp
      );
      expect(restored.mode).toBe(original.mode);
      expect(restored.stemp).toBe(original.stemp);
      console.log(
        `  Restored: mode=${restored.mode}, target=${restored.stemp}°C`
      );
    }, INTEGRATION_TIMEOUT);

    // ── Flow 5: Away mode toggle cycle ──
    it('should toggle away mode and restore', async () => {
      const devices = await client.getDevices();
      if (devices.length === 0) return;
      const device = devices[0];

      const original = await client.getAwayStatus(device.dev_id);
      console.log(`  Original away status: away=${original.away}, enabled=${original.enabled}`);

      try {
        await client.setAwayStatus(device.dev_id, {
          away: !original.away,
          enabled: original.enabled,
        });

        const afterToggle = await waitForAway(
          client, device.dev_id,
          (a) => a.away === !original.away
        );
        expect(afterToggle.away).toBe(!original.away);
        console.log(`  After toggle: away=${afterToggle.away}`);
      } finally {
        await client.setAwayStatus(device.dev_id, {
          away: original.away,
          enabled: original.enabled,
        }).catch((e) => console.warn(`  [cleanup] restore away failed: ${e}`));
      }

      const restored = await waitForAway(
        client, device.dev_id,
        (a) => a.away === original.away
      );
      expect(restored.away).toBe(original.away);
      console.log(`  Restored: away=${restored.away}`);
    }, INTEGRATION_TIMEOUT);

    // ── Flow 6: Concurrent status reads across all heaters ──
    // Read-only: no mutations, no cleanup needed
    it('should handle concurrent status reads across all heaters', async () => {
      const heaters = await findAllHeaters(client);
      if (heaters.length === 0) return;

      console.log(`  Fetching status for ${heaters.length} heater(s) in parallel...`);

      const statusPromises = heaters.map(({ device, heater }) =>
        client.getNodeStatus(device.dev_id, heater.type, heater.addr)
      );
      const statuses = await Promise.all(statusPromises);

      expect(statuses.length).toBe(heaters.length);
      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        const { heater } = heaters[i];
        expect(typeof status.stemp).toBe('number');
        expect(typeof status.mtemp).toBe('number');
        expect(status.mode).toBeDefined();
        console.log(
          `  ${heater.name}: ${status.mtemp}°C (target: ${status.stemp}°C)`
        );
      }
    });

    // ── Flow 7: Token refresh mid-workflow ──
    // Only writes back the same mode (no-op mutation), safe even without cleanup
    it('should recover from token invalidation mid-workflow', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const status1 = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      expect(typeof status1.stemp).toBe('number');
      console.log(`  Before invalidation: ${status1.mtemp}°C`);

      client.getTokenManager().invalidate();
      expect(client.isAuthenticated()).toBe(false);

      // Writes back same mode — no-op, but exercises the auto-refresh path
      await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
        mode: status1.mode,
      });

      const status2 = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      expect(typeof status2.stemp).toBe('number');
      expect(client.isAuthenticated()).toBe(true);
      console.log(`  After recovery: ${status2.mtemp}°C`);
    });

    // ── Flow 8: Concurrent token refresh under load ──
    // Read-only after refresh: no mutations
    it('should deduplicate concurrent token refreshes', async () => {
      const heaters = await findAllHeaters(client);
      if (heaters.length === 0) return;

      client.getTokenManager().invalidate();

      const promises = heaters.map(({ device, heater }) =>
        client.getNodeStatus(device.dev_id, heater.type, heater.addr)
      );
      const results = await Promise.all(promises);

      expect(results.length).toBe(heaters.length);
      for (const status of results) {
        expect(typeof status.stemp).toBe('number');
        expect(typeof status.mtemp).toBe('number');
      }
      expect(client.isAuthenticated()).toBe(true);
      console.log(`  ${results.length} concurrent requests all succeeded after token refresh`);
    });

    // ── Flow 9: Full "leaving home" automation ──
    it('should execute a full "leaving home" automation and rollback', async () => {
      const heaters = await findAllHeaters(client);
      const devices = await client.getDevices();
      if (heaters.length === 0 || devices.length === 0) return;

      const originalStates: Array<{
        device: HelkiDevice;
        heater: HelkiNode;
        status: HelkiNodeStatus;
      }> = [];
      for (const { device, heater } of heaters) {
        const status = await client.getNodeStatus(
          device.dev_id, heater.type, heater.addr
        );
        originalStates.push({ device, heater, status });
      }
      const originalAway = await client.getAwayStatus(devices[0].dev_id);

      const leaveHomeTemps = originalStates.map((s) => s.status.stemp - 2);

      try {
        console.log('  --- Leaving Home ---');

        // Step 1: Lower heater temperatures
        for (let i = 0; i < heaters.length; i++) {
          const { device, heater } = heaters[i];
          await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
            mode: 'manual',
            stemp: leaveHomeTemps[i],
          });
        }

        // Step 2: Verify temps BEFORE toggling away (away mode may override stemp)
        for (let i = 0; i < heaters.length; i++) {
          const { device, heater } = heaters[i];
          const expectedTemp = leaveHomeTemps[i];
          const status = await waitForStatus(
            client, device.dev_id, heater.type, heater.addr,
            (s) => s.mode === 'manual' && s.stemp === expectedTemp
          );
          expect(status.mode).toBe('manual');
          expect(status.stemp).toBe(expectedTemp);
          console.log(`  ${heater.name}: mode=${status.mode}, target=${status.stemp}°C`);
        }

        // Step 3: Toggle away mode (may override stemp on the device)
        await client.setAwayStatus(devices[0].dev_id, {
          away: true,
          enabled: originalAway.enabled,
        });

        const awayAfter = await waitForAway(
          client, devices[0].dev_id, (a) => a.away === true
        );
        expect(awayAfter.away).toBe(true);
        console.log(`  Away mode: ${awayAfter.away}`);
      } finally {
        console.log('  --- Arriving Home (rollback) ---');

        // Restore away FIRST so it doesn't override the temp restore
        await client.setAwayStatus(devices[0].dev_id, {
          away: originalAway.away,
          enabled: originalAway.enabled,
        }).catch((e) => console.warn(`  [cleanup] restore away failed: ${e}`));

        // Small delay to let away-mode release before restoring temps
        await sleep(1500);

        for (const { device, heater, status } of originalStates) {
          await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
            mode: status.mode,
            stemp: status.stemp,
          }).catch((e) => console.warn(`  [cleanup] restore heater failed: ${e}`));
        }
      }

      // Verify rollback with polling — check away first, then temps
      const awayRestored = await waitForAway(
        client, devices[0].dev_id, (a) => a.away === originalAway.away
      );
      expect(awayRestored.away).toBe(originalAway.away);
      console.log(`  Away mode: ${awayRestored.away} (restored)`);

      for (const { device, heater, status: orig } of originalStates) {
        const restored = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.mode === orig.mode && s.stemp === orig.stemp
        );
        expect(restored.mode).toBe(orig.mode);
        expect(restored.stemp).toBe(orig.stemp);
        console.log(
          `  ${heater.name}: mode=${restored.mode}, target=${restored.stemp}°C (restored)`
        );
      }
    }, INTEGRATION_TIMEOUT);

    // ── Flow 10: Rapid sequential temperature changes ──
    it('should handle rapid sequential temperature changes', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const original = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );

      const base = Math.round(original.stemp) - 2;
      const temps = [base, base + 0.5, base + 1, base + 1.5, base + 2];
      console.log(`  Rapidly setting temps: ${temps.join(' → ')}°C`);

      try {
        for (const temp of temps) {
          await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
            mode: original.mode,
            stemp: temp,
          });
        }

        const lastTemp = temps[temps.length - 1];
        const finalStatus = await waitForStatus(
          client, device.dev_id, heater.type, heater.addr,
          (s) => s.stemp === lastTemp
        );
        expect(finalStatus.stemp).toBe(lastTemp);
        console.log(`  Final target temp: ${finalStatus.stemp}°C`);
      } finally {
        await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
          mode: original.mode,
          stemp: original.stemp,
        }).catch((e) => console.warn(`  [cleanup] restore temp failed: ${e}`));
      }
    }, INTEGRATION_TIMEOUT);

    // ── Flow 11: Fresh client re-authentication ──
    // Read-only: no mutations
    it('should work with a freshly authenticated second client', async () => {
      const freshClient = new HelkiApiClient(HELKI_API_BASE);
      await freshClient.authenticate(HELKI_USERNAME!, HELKI_PASSWORD!);
      expect(freshClient.isAuthenticated()).toBe(true);

      const devices = await freshClient.getDevices();
      expect(devices.length).toBeGreaterThan(0);

      const nodes = await freshClient.getNodes(devices[0].dev_id);
      const heater = nodes.find((n) => n.type === 'htr');
      if (!heater) return;

      const status = await freshClient.getNodeStatus(
        devices[0].dev_id, heater.type, heater.addr
      );
      expect(typeof status.stemp).toBe('number');
      expect(typeof status.mtemp).toBe('number');
      console.log(
        `  Fresh client: ${heater.name} at ${status.mtemp}°C (target: ${status.stemp}°C)`
      );
    });

    // ── Flow 12: Status consistency across repeated reads ──
    // Read-only: no mutations
    it('should return consistent status across rapid reads', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      const readings: HelkiNodeStatus[] = [];
      for (let i = 0; i < 5; i++) {
        const status = await client.getNodeStatus(
          device.dev_id, heater.type, heater.addr
        );
        readings.push(status);
      }

      const modes = new Set(readings.map((r) => r.mode));
      const targets = new Set(readings.map((r) => r.stemp));
      expect(modes.size).toBe(1);
      expect(targets.size).toBe(1);
      console.log(
        `  5 rapid reads: mode=${Array.from(modes)[0]}, target=${Array.from(targets)[0]}°C, ` +
        `mtemp range: ${Math.min(...readings.map((r) => r.mtemp))}–${Math.max(...readings.map((r) => r.mtemp))}°C`
      );
    });

    // ── Flow 13: Error handling doesn't corrupt client state ──
    // The write is a no-op (same mode), safe without cleanup
    it('should continue working after an API error', async () => {
      const found = await findFirstHeater(client);
      if (!found) return;
      const { device, heater } = found;

      await expect(
        client.getNodes('does-not-exist-99999')
      ).rejects.toThrow();

      const status = await client.getNodeStatus(
        device.dev_id, heater.type, heater.addr
      );
      expect(typeof status.stemp).toBe('number');
      expect(typeof status.mtemp).toBe('number');
      console.log(`  After error recovery: ${heater.name} at ${status.mtemp}°C`);

      // Write-back is a no-op (same mode)
      await client.setNodeStatus(device.dev_id, heater.type, heater.addr, {
        mode: status.mode,
      });
      console.log('  Set mode succeeded after error');
    });

    // ── Flow 14: Mixed read/write across multiple devices ──
    it('should read from one heater and mirror to another', async () => {
      const heaters = await findAllHeaters(client);
      if (heaters.length < 2) {
        console.log('  Need at least 2 heaters for mirror test, skipping');
        return;
      }

      const [source, target] = heaters;

      const targetOriginal = await client.getNodeStatus(
        target.device.dev_id, target.heater.type, target.heater.addr
      );

      try {
        const sourceStatus = await client.getNodeStatus(
          source.device.dev_id, source.heater.type, source.heater.addr
        );
        console.log(
          `  Source (${source.heater.name}): mode=${sourceStatus.mode}, target=${sourceStatus.stemp}°C`
        );

        await client.setNodeStatus(
          target.device.dev_id, target.heater.type, target.heater.addr,
          { mode: sourceStatus.mode, stemp: sourceStatus.stemp }
        );

        const targetUpdated = await client.getNodeStatus(
          target.device.dev_id, target.heater.type, target.heater.addr
        );
        expect(targetUpdated.mode).toBe(sourceStatus.mode);
        expect(targetUpdated.stemp).toBe(sourceStatus.stemp);
        console.log(
          `  Target (${target.heater.name}): mode=${targetUpdated.mode}, target=${targetUpdated.stemp}°C (mirrored)`
        );
      } finally {
        await client.setNodeStatus(
          target.device.dev_id, target.heater.type, target.heater.addr,
          { mode: targetOriginal.mode, stemp: targetOriginal.stemp }
        ).catch((e) => console.warn(`  [cleanup] restore mirror target failed: ${e}`));
      }

      console.log(`  Target restored to: mode=${targetOriginal.mode}, target=${targetOriginal.stemp}°C`);
    });
  }
);

// Always have at least one test so Jest doesn't complain
describe('Integration test setup', () => {
  it('should skip when credentials are not provided', () => {
    if (!HELKI_USERNAME || !HELKI_PASSWORD) {
      console.log(
        'Skipping integration tests. Set HELKI_USERNAME and HELKI_PASSWORD to run.'
      );
    }
    expect(true).toBe(true);
  });
});
