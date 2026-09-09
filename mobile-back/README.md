# Attendance Mobile Backend

Standalone Express API for the mobile attendance app (`/api/attendance`).

## Setup

```bash
cd attendance/mobile-back
npm install
```

Credentials load from `mobile-back/.env`. Copy `.env.example` to `.env` when setting up on a new machine.

## Run

```bash
npm start
```

Listens on port **4000** by default.

## Seed admin user

```bash
npm run seed
```

Defaults: `admin1234` / `admin4321`

## Uploads

All images and files are stored on the FTP server configured via `FTP_*` env vars
(see `.env.example`). Public URLs use `FTP_PUBLIC_BASE_URL` — nothing is written to local disk.
