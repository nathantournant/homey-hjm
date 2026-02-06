# Agent Context for homey-hjm

This file captures accumulated context from development sessions to help future agents work effectively on this codebase.

## Project Overview

Homey app for controlling HJM WiFi radiators via the Helki/Smartbox cloud API. Written in TypeScript, runs on Homey Pro hardware using SDK v3.

## Critical: API Field Semantics

> **The Helki API field names are counterintuitive. Getting these wrong silently inverts the UI.**

| API Field | Meaning | Homey Capability | Mnemonic |
|-----------|---------|------------------|----------|
| `stemp` | **S**et temperature (target/setpoint) | `target_temperature` | "s" = set |
| `mtemp` | **M**easured temperature (current/sensor) | `measure_temperature` | "m" = measured |

This was discovered via real device data: a radiator with target=16 and current=16.2 was reporting `stemp=16, mtemp=16.2` in the API, confirming `stemp` is the target.

**When writing code that maps stemp/mtemp to Homey capabilities, always double-check the mapping.**

## Architecture

```
app.ts                          # Homey.App — creates HelkiApiClient, registers flow cards
drivers/radiator/device.ts      # Homey.Device — per-radiator: polling, socket, capabilities
drivers/radiator/driver.ts      # Homey.Driver — pairing flow (login + device discovery)
lib/HelkiApiClient.ts           # HTTP client — REST API, 401 auto-refresh, error translation
lib/HelkiTokenManager.ts        # OAuth token lifecycle — authenticate, refresh, dedup
lib/HelkiSocketClient.ts        # Socket.io — real-time updates, reconnect with backoff
lib/types.ts                    # All interfaces + parseNodeStatus() utility
```

### Data Flow

1. **Polling path**: `device.pollStatus()` → `api.getNodeStatus()` → raw strings → `parseNodeStatus()` → `updateCapabilities()`
2. **Socket path**: Helki socket emits `update` → `device.handleSocketUpdate()` → `parseNodeStatus()` → `updateCapabilities()`
3. **Write path**: User changes target temp → `device.setTargetTemperature()` → `api.setNodeStatus({ stemp: value })` → API stringifies

### Key Design Decisions

- **Socket.io reconnection is manual** (`reconnection: false` in socket options). `HelkiSocketClient` implements its own exponential backoff with a 60s cap and 10-attempt max.
- **Polling is the fallback**. 60s interval runs regardless of socket state to catch missed updates.
- **Token refresh is deduplicated** in both `HelkiTokenManager.refresh()` and the 401 interceptor in `HelkiApiClient`. Concurrent 401s share a single refresh promise.
- **Flow card actions do NOT call `setCapabilityValue`** directly. They only call `triggerCapabilityListener`, letting the poll/socket update the displayed value after API confirmation.

## API Notes (Helki/Smartbox)

- **Base URL**: `https://api-hjm.helki.com`
- **Auth**: OAuth password grant with a hardcoded Basic Auth client ID
- **All temperatures are strings** in API responses and socket updates (e.g. `"21.5"`). `parseNodeStatus()` converts them to numbers.
- **Socket `addr` can arrive as string** despite being typed as number. Always use `Number(n.addr)` for comparison.
- **`HelkiNode.addr`** is an integer identifier for a node within a device. A device (SmartBox) can have multiple nodes (heaters, thermostats, etc.).
- **Node types**: `htr` (heater — the only type we pair), `thm` (thermostat), `acm` (accumulator), `htr_mod`, `pmo` (power monitor).

## Bugs Fixed (2026-02-06)

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| BUG-1 | HIGH | 401 interceptor race — concurrent 401s triggered multiple refreshes | Replaced `isRefreshing` boolean with shared `refreshPromise` |
| BUG-2 | HIGH | `isAuthenticated()` only checked token != null, not expiry | Added `Date.now() < this.tokenExpiresAt` check |
| BUG-9 | HIGH | stemp/mtemp mapping inverted — target shown as current and vice versa | Swapped mapping: `stemp→target_temperature`, `mtemp→measure_temperature` |
| BUG-3 | MEDIUM | `parseFloat("")` or `parseFloat("N/A")` returned NaN, propagated to UI | Added `isNaN()` guard, return `undefined` instead |
| BUG-4 | MEDIUM | Flow card actions called `setCapabilityValue` before API confirmed | Removed premature `setCapabilityValue`, keep only `triggerCapabilityListener` |
| BUG-5 | MEDIUM | Socket update `addr` was string, strict `===` comparison with number failed | Use `Number(n.addr) === nodeAddr` |
| BUG-6 | LOW | Exponential backoff grew unbounded (5s, 10s, 20s, 40s, 80s, 160s...) | Capped at 60s with `Math.min(..., MAX_RECONNECT_DELAY_MS)` |
| BUG-7 | LOW | `onDeleted()` called `onUninit()` — double cleanup if Homey calls both | Removed `onDeleted()` entirely; `onUninit()` is sufficient |
| BUG-8 | LOW | Socket URL hardcoded to `https://api-hjm.helki.com` in device | Added `getApiBase()` getter on `HelkiApiClient`, used in `connectSocket()` |

Also removed dead `setCredentials()` method from `HelkiTokenManager`.

## Testing

### Run Commands

```bash
npm test                    # All unit + integration (integration skipped without creds)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration only (needs HELKI_USERNAME + HELKI_PASSWORD)
npm test -- --coverage      # With coverage report
```

### Integration Tests

Require real credentials via environment variables:
```bash
HELKI_USERNAME=your@email.com HELKI_PASSWORD=yourpass npm run test:integration
```

These are automatically skipped in CI unless secrets are configured.

### Mocking Patterns

- **Homey SDK**: `test/unit/mocks/homey.mock.ts` provides `createHomeyMock()` and default `App`/`Device`/`Driver` classes
- **socket.io-client**: Mocked at module level with `jest.mock('socket.io-client')`, exposes `__mockSocket` for handler simulation
- **HelkiApiClient**: Mocked per-test with `jest.mock('../../../../lib/HelkiApiClient')`
- **HTTP (nock)**: Used in `HelkiApiClient` and `HelkiTokenManager` tests to intercept real axios calls
- **Device tests**: Create device via `Object.create(HJMRadiatorDevice.prototype)` and manually assign mocks to avoid Homey constructor

### Coverage (as of 2026-02-06)

| File | Statements | Functions |
|------|-----------|-----------|
| app.ts | 96% | 100% |
| drivers/radiator/device.ts | 80% | 41% |
| drivers/radiator/driver.ts | 100% | 100% |
| lib/HelkiApiClient.ts | 97% | 94% |
| lib/HelkiSocketClient.ts | 96% | 100% |
| lib/HelkiTokenManager.ts | 86% | 82% |
| lib/types.ts | 100% | 100% |

The `device.ts` function coverage is lower because many anonymous callbacks (socket event handlers, `.catch()` handlers, interval callbacks) are hard to exercise through the mock pattern. This is a known limitation, not a gap in logic coverage.

## Build & CI

```bash
npm run build     # tsc
npm run lint      # eslint (expect ~30 no-explicit-any warnings in tests, 0 errors)
npm test          # jest
```

CI runs 3 jobs via GitHub Actions: `validate` (build + `homey app validate`), `test` (build + lint + jest --coverage), `integration` (build + integration tests if secrets available).

## Fixture Data

Test fixtures in `test/fixtures/`:
- `devices.json` — 2 SmartBox devices
- `nodes.json` — 3 nodes (htr, thm, acm)
- `status.json` — Full raw node status with string temps (`stemp: "21.5"`, `mtemp: "22.0"`)

**Note**: The fixture `stemp`/`mtemp` values (21.5 and 22.0) are close enough that swapping them doesn't cause obvious test failures. When writing new tests with temperature data, use clearly distinct values (e.g. stemp=16, mtemp=21) to catch inversion bugs.
