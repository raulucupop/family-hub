# Family Hub

Self-hostable family finance & asset manager, built for Romanian households.

One shared account per family: budget and expenses, utility bills with due-date reminders and PDF invoices, vehicles (RCA, Casco, Rovinietă, ITP, vehicle tax) and properties (PAD insurance, property tax, mortgage, maintenance history).

**Stack:** Node.js + Express + SQLite (single file, zero external services) · vanilla JS frontend + Chart.js. Runs anywhere Node runs, or in Docker.

## Features

- **Auth & family sharing** — create a family (you become admin), invite members with an 8-character code. Roles: `admin` (manage members), `adult` (edit everything), `child` (view only).
- **Budget** — income & expense tracking by category, monthly budgets vs actual, 6-month trends, category doughnut, CSV export.
- **Bills** — electricity/gas/internet/mobile/water/property tax, recurring schedules, paid/unpaid status, payment history, PDF/image invoice attachments. Marking a bill paid also logs the expense and rolls recurring bills to the next due date.
- **Vehicles** — RCA, Casco, Rovinietă, ITP and vehicle-tax expiry tracking; service, tire and fuel logs with odometer.
- **Properties** — insurance (PAD) and property-tax deadlines, mortgage details, maintenance/renovation/utility history.
- **Dashboard** — a "coming up" ribbon of every deadline in the next 60 days, color-coded (amber ≤ 14 days, red = overdue).
- **Bank import** — upload a CSV statement (BT, BCR, ING, Revolut…), map columns (single amount or debit/credit layout), auto-categorization of Romanian merchants (Lidl → Groceries, OMV → Transportation, PPC → Utilities…), review, import. Duplicate transactions are skipped automatically, so re-uploading the same statement is safe.
- **Site alerts** — notifications are generated when any deadline crosses 30 / 14 / 7 / 1 / 0 days or goes overdue. Bell badge in the sidebar with per-user read status, plus optional browser notifications while the site is open in a tab.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
```

First visit: choose **New family** to register. All data lives in `./data/` (SQLite DB + uploaded invoices).

## Run with Docker

```bash
docker compose up -d --build
```

Data persists in the `familyhub-data` volume.

> **Cookie note:** login cookies are marked `Secure` in production. If you host over plain HTTP (e.g. a LAN home server without TLS), set `INSECURE_COOKIES=1` or logins will silently fail. Behind HTTPS (any of the hosts below, or a reverse proxy with a certificate) leave it unset.

## Put it on GitHub

```bash
git remote add origin https://github.com/<your-username>/family-hub.git
git push -u origin main
```

(The repo is already initialized with an initial commit.)

## Hosting options

Anything that runs Node or Docker works. The only requirement is a **persistent disk** for `DATA_DIR` (SQLite + uploads).

| Host | How | Notes |
|---|---|---|
| **Railway** | New project → Deploy from GitHub repo | Add a Volume mounted at `/data`, set `DATA_DIR=/data`. Free HTTPS. |
| **Render** | New Web Service → connect repo | Add a Disk mounted at `/data`, set `DATA_DIR=/data`. |
| **Fly.io** | `fly launch` (detects Dockerfile) | `fly volumes create data`, mount at `/data`. |
| **VPS (Hetzner, DigitalOcean…)** | `docker compose up -d` | Put Caddy or nginx in front for HTTPS, or set `INSECURE_COOKIES=1` on LAN. |
| **Home server / Raspberry Pi** | `npm start` or Docker | Great for a family app; pair with Tailscale for secure remote access. |

⚠️ Not suitable for serverless platforms (Vercel/Netlify functions) as-is — SQLite and file uploads need a persistent filesystem.

## Configuration

See `.env.example`. Key variables: `PORT`, `JWT_SECRET` (auto-generated and persisted if omitted), `DATA_DIR`, `INSECURE_COOKIES`.

## Backup

Copy the `data/` directory (or the Docker volume). That's the entire application state.

## Roadmap ideas

Camera invoice scanning + OCR, calendar view, email/push notifications (server-sent), PDF monthly reports, AI spending insights, direct bank API import (PSD2).

## License

MIT
