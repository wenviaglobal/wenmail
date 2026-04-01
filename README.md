# MailPlatform

A self-hosted, multi-tenant email hosting platform. Manage email infrastructure for multiple clients — each with their own domain, mailboxes, and aliases — from a single VPS.

## What This Is

- **Admin Dashboard** — Platform operators manage clients, domains, billing, server health
- **Client Portal** — Clients self-manage their domains, mailboxes, aliases, view DNS guides
- **Mail Server Integration** — Postfix/Dovecot query PostgreSQL directly for auth and routing
- **Background Workers** — DNS verification, quota sync, log cleanup via BullMQ

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22 + Fastify 5 + TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + BullMQ |
| Frontend | React 19 + Vite 6 + TailwindCSS 4 + TanStack Query |
| Mail Server | Postfix (SMTP) + Dovecot (IMAP) + Rspamd (Spam) |
| Webmail | Roundcube |
| Auth | JWT (separate tokens for admin and client portal) |

## Architecture

**Modular monolith** — single backend process with cleanly separated modules. Not microservices.

```
┌─────────────────────────────────────────────────┐
│  Frontend (React SPA)                           │
│  ├── Admin Dashboard    → /login                │
│  └── Client Portal      → /portal/login         │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Backend API (Fastify)                          │
│  ├── /api/auth/*              Admin auth        │
│  ├── /api/clients/*           Client CRUD       │
│  ├── /api/domains/*           Domain mgmt       │
│  ├── /api/mailboxes/*         Mailbox mgmt      │
│  ├── /api/aliases/*           Alias mgmt        │
│  ├── /api/plans/*             Plan CRUD         │
│  ├── /api/logs/*              Mail/audit logs   │
│  ├── /api/dashboard/*         Stats             │
│  ├── /api/admin/*             Billing, health,  │
│  │                            settings, controls│
│  ├── /api/client-portal/*     Client self-serve │
│  └── Workers (BullMQ)         DNS, quota, logs  │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  PostgreSQL ◄──── Postfix (SQL maps)            │
│             ◄──── Dovecot (SQL auth)            │
└─────────────────────────────────────────────────┘
```

## Project Structure

```
Email server/
├── backend/
│   ├── src/
│   │   ├── app.ts                    # Fastify app + route registration
│   │   ├── server.ts                 # Entry point
│   │   ├── config/env.ts             # Zod-validated env vars
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle client
│   │   │   ├── schema.ts             # All table definitions
│   │   │   └── migrations/           # Auto-generated SQL
│   │   ├── lib/                      # Shared: redis, logger, password, errors
│   │   ├── mail/                     # Postfix/Dovecot reload commands
│   │   ├── modules/
│   │   │   ├── auth/                 # Admin JWT auth
│   │   │   ├── clients/              # Client company CRUD
│   │   │   ├── domains/              # Domain mgmt + DNS verification
│   │   │   ├── mailboxes/            # Mailbox CRUD
│   │   │   ├── aliases/              # Email forwarding
│   │   │   ├── plans/                # Subscription plans
│   │   │   ├── logs/                 # Mail + audit logs
│   │   │   ├── dashboard/            # Aggregate stats
│   │   │   ├── billing/              # Invoices, payments, client controls
│   │   │   ├── client-portal/        # Client auth + self-service API
│   │   │   ├── server-health/        # System monitoring
│   │   │   └── settings/             # Platform config (key-value)
│   │   └── workers/                  # BullMQ background jobs
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Router (admin + portal routes)
│   │   ├── api/                      # Typed API clients
│   │   ├── components/               # Shared UI components
│   │   ├── hooks/                    # useAuth, usePortalAuth
│   │   ├── pages/
│   │   │   ├── dashboard.tsx         # Admin dashboard
│   │   │   ├── clients/              # Client list + detail
│   │   │   ├── domains/              # Domain list + detail
│   │   │   ├── mailboxes/            # Mailbox list
│   │   │   ├── aliases/              # Alias list
│   │   │   ├── logs/                 # Mail + audit logs
│   │   │   ├── admin/                # Server health, billing, settings, controls
│   │   │   └── portal/               # Client portal (login, domains, mailboxes, etc.)
│   │   └── lib/utils.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docs/
│   ├── ARCHITECTURE.md               # System design + DB schema + flow diagrams
│   ├── PROJECT_DICTIONARY.md         # Module-by-module reference
│   └── PROJECT_VISION.md             # Goals, principles, milestones
├── docker-compose.yml                # PostgreSQL + Redis + app containers
├── start-dev.bat                     # Windows dev launcher
└── README.md                         # ← you are here
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `admins` | Platform admin accounts |
| `plans` | Subscription tiers with limits |
| `clients` | Client companies (tenants) + billing status + limit overrides |
| `client_users` | Client portal login accounts |
| `domains` | Email domains + DNS verification state + DKIM keys |
| `mailboxes` | Email accounts (Dovecot-compatible password hash) |
| `aliases` | Email forwarding rules |
| `invoices` | Billing invoices per client |
| `payments` | Payment records |
| `mail_logs` | Send/receive activity |
| `dns_checks` | DNS verification history |
| `audit_log` | Admin action trail |
| `platform_settings` | Key-value config (server IP, hostname, etc.) |

## Two Auth Systems

| System | Login URL | JWT Contains | Access |
|--------|-----------|-------------|--------|
| **Admin** | `/login` | `{ id, email, role }` | Full platform access |
| **Client Portal** | `/portal/login` | `{ id, clientId, type: "client" }` | Only their own data |

Client portal users can only see/modify resources belonging to their `clientId`. Enforced at the API level.

## Getting Started (Development)

### Prerequisites

- **Node.js 22+** and npm
- **PostgreSQL 16** (pgAdmin works)
- **Redis** (any version for dev — workers need 5+)

### 1. Create Database

In pgAdmin, create database `emailplatform` owned by user `postgres` (password: `admin`).

### 2. Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Run Migrations

```bash
cd backend
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 4. Seed Initial Data

```bash
cd backend
set DATABASE_URL=postgresql://postgres:admin@localhost:5432/emailplatform
set JWT_SECRET=dev-secret-key-change-in-production-must-be-at-least-32-chars
set REDIS_URL=redis://localhost:6379
npx tsx src/seed.ts
```

This creates:
- Admin: `admin@mailplatform.com` / `admin123456`
- Demo client: "Demo Company" with portal user `user@democompany.com` / `client123456`
- Two plans: Starter, Business

### 5. Start Dev Servers

**Option A: Batch file (Windows)**
```
Double-click start-dev.bat
```

**Option B: Manual (two terminals)**

Terminal 1 — Backend:
```bash
cd backend
set DATABASE_URL=postgresql://postgres:admin@localhost:5432/emailplatform
set JWT_SECRET=dev-secret-key-change-in-production-must-be-at-least-32-chars
set REDIS_URL=redis://localhost:6379
set NODE_ENV=development
set PORT=3000
set HOST=0.0.0.0
set PLATFORM_DOMAIN=mail.yourplatform.com
npx tsx watch src/server.ts
```

Terminal 2 — Frontend:
```bash
cd frontend
npx vite --host
```

### 6. Open in Browser

| URL | What |
|-----|------|
| `http://localhost:5173` | Admin Dashboard |
| `http://localhost:5173/portal/login` | Client Portal |
| `http://localhost:3000/api/health` | API Health Check |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Min 32 chars, used for signing tokens |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection |
| `PORT` | No | `3000` | Backend API port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `PLATFORM_DOMAIN` | No | `mail.yourplatform.com` | Fallback mail hostname |

> **Note:** In production, configure server hostname/IP via Admin > Settings page instead of env vars. The platform_settings table takes precedence.

## Production Deployment

Mail services (Postfix, Dovecot, Rspamd) run on the VPS host (not Docker). App services run in Docker:

```bash
docker compose up -d
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full deployment guide, Postfix/Dovecot SQL configs, and security checklist.

## Client Onboarding Flow

```
1. Admin creates client + plan in dashboard
2. Admin creates portal user for client
3. Client logs into portal
4. Client reads "Getting Started" guide
5. Client adds their domain
6. Client follows DNS Guide → adds 5 DNS records at registrar
7. Client clicks Verify → badges turn green
8. Client creates mailboxes (john@theirdomain.com)
9. Client configures email client (Thunderbird/Outlook) with IMAP/SMTP
10. Email works
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Modular monolith over microservices | 30-50 clients = small scale. One process, clean boundaries. |
| PostgreSQL over MongoDB | Postfix/Dovecot query SQL directly. No middleware needed. |
| Drizzle over Prisma | SQL-close, no binary engine. Same tables queried by Postfix. |
| Two JWTs over one | Admin and client are different auth domains. Clean separation. |
| Platform settings in DB over env vars | Admin can change hostname/IP from UI without server restart. |
| Workers in same process | At this scale, separate worker service = unnecessary complexity. |

## Further Reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design, DB schema, data flows
- [docs/PROJECT_DICTIONARY.md](docs/PROJECT_DICTIONARY.md) — Module-by-module reference (grep-friendly)
- [docs/PROJECT_VISION.md](docs/PROJECT_VISION.md) — Goals, principles, success milestones
