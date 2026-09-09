# Attendance Mobile App

React Native (Expo SDK 54) mobile client for the Izzy Tech Team attendance system.

## Setup

```bash
cd attendance/mobile-front
npm install
```

## API URL

The app talks to the same Express backend as the web portal.

Create a `.env` file (optional):

```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

Defaults if unset:

- **Physical device (Expo Go):** auto-detects your PC's LAN IP from Metro (e.g. `http://192.168.8.105:4000`)
- **iOS simulator:** `http://localhost:4000`
- **Android emulator:** `http://10.0.2.2:4000`

Override manually if needed:

```env
EXPO_PUBLIC_API_URL=http://192.168.8.105:4000
```

## Run

```bash
npm start
```

Then press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with Expo Go on a physical device.

## Auth

- Login uses `POST /api/attendance/auth/login`
- JWT is stored securely via `expo-secure-store`
- Requests send `Authorization: Bearer <token>`
- Defaults: `admin1234` / `admin4321` (admin), `accountant@!` / `accountant!` (accountant)

## Project structure

```
src/
  api/          # Backend client
  components/   # Reusable UI
  context/      # Auth state
  screens/      # Login, Home (placeholder)
  theme/        # Colors matching web portal
```
