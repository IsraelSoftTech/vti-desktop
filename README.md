# Attendance

Mobile attendance system for Izzy Tech Team.

## Structure

```
attendance/
  mobile-front/   # Expo React Native app (QR/barcode attendance, fees, ID cards, reports)
  mobile-back/    # Express API routes and helpers for /api/attendance
```

The API can run standalone from `attendance/mobile-back/` or is also mounted by `backend/server.js`.

## Quick start

**Attendance API** (recommended for mobile development):

```bash
cd attendance/mobile-back
npm install
npm start
```

**Mobile app:**

```bash
cd attendance/mobile-front
npm install
npm start
```

**Full site backend** (optional — includes attendance API at `/api/attendance`):

```bash
cd backend
npm start
```

Default login: `admin1234` / `admin4321` (admin) · `accountant@!` / `accountant!` (accountant)

See [mobile-front/README.md](./mobile-front/README.md) for API URL configuration.
