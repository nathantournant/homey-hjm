# HJM Radiator for Homey

Control your HJM WiFi radiators with [Homey](https://homey.app).

## Features

- View current temperature
- Set target temperature (5-35°C)
- Switch modes (Off, Manual, Auto, Self Learning, Presence)
- Real-time updates via Socket.io
- Flow cards for automation (triggers, conditions, actions)
- Spanish and English language support

## Supported Devices

- HJM NOELLE (ceramic core)
- HJM IXORA (ceramic core)
- HJM OPTIMA
- HJM ARIA
- Other HJM WiFi radiators using SmartBox

## Requirements

- **Homey Pro** (sideloading is not supported on Homey Cloud / Homey Bridge)
- **Node.js** >= 16
- **Homey CLI** (`npm install -g homey`)
- An HJM account (same email/password you use in the HJM mobile app)

## Installation

### 1. Install the Homey CLI and log in

```bash
npm install -g homey
homey login
homey select       # Select your Homey Pro on the local network
```

### 2. Clone, build, and install

```bash
git clone https://github.com/nathantournant/homey-hjm.git
cd homey-hjm
npm install
npm run build
homey app install   # Permanently installs on your Homey
```

The app will now run in the background and survive reboots.

### Uninstall

```bash
homey app uninstall
```

Or from the Homey mobile app: More > Apps > HJM Radiator > Delete.

## Pairing Your Radiators

1. Open the Homey mobile app
2. Go to **Devices > + (Add Device) > HJM Radiator**
3. Enter your HJM email and password (same as the HJM mobile app)
4. Select the radiators you want to add

## Flow Cards

### Triggers
- **Temperature changed** - fires when the measured temperature changes
- **Mode changed** - fires when the radiator mode changes

### Conditions
- **Temperature is above/below** - check current temperature against a threshold
- **Mode is/is not** - check if the radiator is in a specific mode

### Actions
- **Set temperature** - set the target temperature
- **Set mode** - set the operating mode

## Development

```bash
npm install
npm run build
npm run lint
homey app run       # Sideload in dev mode (logs stream to terminal, stops on ctrl+c)
```

### Running Tests

```bash
npm test                # All unit tests
npm run test:coverage   # With coverage report
```

### Integration Tests

Integration tests hit the real Helki API and are skipped by default.

**Locally:**
```bash
HELKI_USERNAME=your@email.com HELKI_PASSWORD=yourpassword npm test
```

**In CI:** set two GitHub project variables so the `integration` job runs automatically:

1. Go to **Settings > Secrets and variables > Actions**
2. Under **Variables**, add `HELKI_USERNAME` (your HJM email)
3. Under **Secrets**, add `HELKI_PASSWORD` (your HJM password)

The integration job is skipped when these are not configured.

## How It Works

This app communicates with HJM radiators through the Helki cloud platform (the same backend used by the HJM mobile app). Authentication uses your HJM email and password — the app exchanges these for a Bearer token internally and handles token refresh automatically.

- **REST API** for device discovery, status reads, and control commands
- **Socket.io** for real-time temperature and status updates
- **Polling** (60s interval) as a fallback when the socket connection is unavailable

## Troubleshooting

- **Pairing fails with auth error** — verify your credentials work in the official HJM mobile app first. If they do and it still fails, the OAuth client credentials may need updating (see `lib/HelkiTokenManager.ts`).
- **Device shows "Connection lost"** — the app will auto-recover on the next poll cycle (60s). Check your internet connection if it persists.
- **Temperatures not updating** — the Socket.io connection may have dropped. The app falls back to polling every 60 seconds automatically.

## Credits

- [smartbox](https://github.com/ajtudela/smartbox) - Python API reference
- [hass-smartbox](https://github.com/ajtudela/hass-smartbox) - Home Assistant integration reference

## License

[MIT](LICENSE)
