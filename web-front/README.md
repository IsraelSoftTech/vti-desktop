# Attendance Web App

Web client for the same **MPASAT** attendance system as `mobile-front`. It uses the attendance API on `mobile-back` (`/api/attendance`).

## Setup

```bash
cd web-front
npm install
```

## API URL

In development, leave `VITE_API_URL` empty in `.env.development` so Vite proxies `/api` to `http://localhost:4000`.

For production, set the full API origin in `.env.production`:

```env
VITE_API_URL=https://your-api-host.example.com
```

Start the API first:

```bash
cd ../mobile-back
npm start
```

## Run

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Auth

- Login: `POST /api/attendance/auth/login`
- JWT stored in `localStorage` (`attendance_token`)
- Requests send `Authorization: Bearer <token>`

Default dev users match the mobile app (see root `README.md`).

## Status

Currently implements **login** and the admin **dashboard (Home)** mirroring the mobile app. Navigation uses a **responsive sidebar**: fixed menu with labels on laptops/desktops (≥1024px), slide-out drawer opened via the menu icon on phones/tablets. Other sections show placeholders until ported.
