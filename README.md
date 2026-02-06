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

## Installation

### From source (Homey Self-Hosted)

```bash
git clone https://github.com/nathantournant/homey-hjm.git
cd homey-hjm
npm install
npm run build
homey app install
```

## Configuration

1. Add a new device in Homey
2. Select "HJM Radiator"
3. Enter your HJM app credentials (same email/password as the HJM mobile app)
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
npm test
homey app run    # Run on connected Homey
```

### Running tests

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:coverage # With coverage report
```

## How it works

This app communicates with HJM radiators through the Helki cloud platform (the same backend used by the HJM mobile app). It uses:

- **REST API** for device discovery, status reads, and control commands
- **Socket.io** for real-time temperature and status updates
- **Polling** (60s interval) as a fallback when the socket connection is unavailable

## Credits

- [smartbox](https://github.com/ajtudela/smartbox) - Python API reference
- [hass-smartbox](https://github.com/ajtudela/hass-smartbox) - Home Assistant integration reference

## License

[MIT](LICENSE)
