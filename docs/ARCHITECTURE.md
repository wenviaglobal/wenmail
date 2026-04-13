# Multi-Tenant Email Hosting System — Architecture

## Overview

A self-hosted email platform where:
- **You** own one domain (your company/platform domain)
- **Each client** brings their own domain
- You manage all email infrastructure on your VPS
- **Clients** get their own portal to manage domains, mailboxes, aliases, and view billing
- **Admin** has full control: client management, billing, server health monitoring, platform settings
- Target: 30-50 clients, ~100 mailboxes per client (3,000-5,000 total mailboxes)

---

## System Design Decisions

### 1. Modular Monolith (NOT Microservices)

```
WHY NOT microservices:
  - 30-50 clients is small scale — microservices adds deployment/debugging overhead
  - You'd need service discovery, inter-service auth, distributed tracing
  - A single developer/small team cannot maintain 5+ separate services

WHAT WE DO instead:
  - Single backend app with clearly separated modules
  - Each module owns its routes, service logic, and DB queries
  - Modules communicate via direct function calls (not HTTP/gRPC)
  - Can extract any module into a service later if needed

STRUCTURE:
  backend/
    src/modules/
      auth/              → admin auth (JWT type admin)
      client-portal/     → client auth + self-service routes (JWT type client)
      clients/           → admin client management
      domains/           → admin domain management + DNS service
      mailboxes/         → admin mailbox management
      aliases/           → admin alias management
      plans/             → plan CRUD
      logs/              → admin mail/audit log access
      dashboard/         → admin dashboard stats
      billing/           → invoices, payments, client controls, client user management
      server-health/     → CPU, RAM, disk, DB, Redis, mail service monitoring
      abuse/             → Rspamd stats, high volume senders, bounce tracking, alerts
      bans/              → Fail2ban IP management, custom blocklist with Rspamd sync
      settings/          → platform settings (key-value store)
  Each module = its own mini-service inside one process
```

### 2. Two Auth Systems

```
WHY two separate auth flows:
  - Admin and client users have fundamentally different permissions
  - Admin sees all clients; client sees only their own data
  - Separate JWT types prevent privilege escalation

HOW it works:
  Admin auth:
    - admins table (email + argon2 password)
    - JWT payload: { id, email, role, type: "admin" }
    - Guard: auth.guard.ts — verifies JWT only
    - Routes: /api/auth/login, /api/auth/refresh

  Client portal auth:
    - client_users table (email + argon2 password, linked to a client)
    - JWT payload: { id, clientId, email, role, type: "client" }
    - Guard: client-auth.guard.ts — verifies JWT + checks type === "client"
    - Routes: /api/client-portal/auth/login, /refresh, /me, /password, /forgot-password
    - Client status checked: suspended clients cannot log in
    - Forgot password: client submits request (public, no auth) -> admin resolves it manually

  Token lifetimes:
    - Admin: 15min access + 7d refresh
    - Client: 30min access + 7d refresh
```

### 3. PostgreSQL — Primary Database

```
WHY PostgreSQL:
  - Postfix and Dovecot query it DIRECTLY via SQL maps (no middleware)
  - JSONB for flexible audit log details
  - Battle-tested for this exact use case (millions of mail servers use it)
  - UUID primary keys for multi-tenant safety

WHY NOT MySQL:
  - PostgreSQL has better JSON support, better extension ecosystem
  - Dovecot's PostgreSQL driver is more mature

WHY NOT MongoDB:
  - Postfix/Dovecot cannot query MongoDB
  - Relational data (clients -> domains -> mailboxes) fits SQL perfectly
```

### 4. Redis — Session Store + Job Queue + Rate Limiter

```
WHAT Redis handles (5 specific jobs):
  1. Session store     -> JWT refresh tokens, admin sessions
  2. Job queue backend -> BullMQ stores job data here
  3. Rate limiter      -> per-user/domain send rate counters (sliding window)
  4. IMAP pool sessions -> persistent IMAP connections per webmail session (max 2 per mailbox)
  5. Contacts store    -> webmail contacts per user (sorted sets, max 200)
  5. Contacts store    -> webmail contacts per user (sorted sets, max 200)

WHAT Redis does NOT handle:
  - NOT a cache layer (premature at this scale — PostgreSQL is fast enough)
  - NOT a primary data store

GRACEFUL DEGRADATION:
  - Redis 3 works for dev (rate limiter uses in-memory fallback)
  - Workers auto-disable if Redis < 5.0 (BullMQ requirement)
  - API runs fine without workers
```

### 5. BullMQ Worker Pool — Background Jobs

```
WHY workers are needed:
  - DNS verification takes 2-5 seconds (can't block API response)
  - Quota calculation scans filesystem (slow)
  - Log cleanup runs on schedule
  - DKIM key generation is CPU-intensive

HOW it works:
  - BullMQ runs INSIDE the same Node.js process (not a separate service)
  - Workers are dynamically imported only if Redis >= 5.0
  - If workers fail to start, API continues running (non-fatal)

JOBS:
  dns-check        -> verify client DNS records        (cron: every hour)
  quota-sync       -> calculate mailbox disk usage     (cron: every 6 hours)
  log-cleanup      -> purge old mail logs              (cron: daily at 3 AM)
  domain-setup     -> verify domain + gen DKIM         (on-demand, triggered by API)
  mail-log-sync    -> parse Postfix syslog, write to mail_logs table (cron: every 5 min)
  scheduled-send   -> send pending scheduled emails    (cron: every minute)

WHY NOT a separate worker service:
  - Same codebase, same DB access, same logic
  - At this scale, one Node.js process handles both API + workers fine
  - If workers start starving API, split later (the code is already modular)
```

### 6. Drizzle ORM (NOT Prisma)

```
WHY Drizzle:
  - SQL-close — you see and control the queries
  - Lightweight (no binary engine like Prisma)
  - TypeScript-first with type-safe schema
  - Easy to write raw SQL when needed (Postfix/Dovecot SQL maps)
  - Migration system built-in (drizzle-kit)

WHY NOT Prisma:
  - Heavy binary engine, slower cold starts
  - Abstracts SQL too much — we need to understand exact queries
    because Postfix/Dovecot also query the same tables
  - Harder to write raw SQL alongside ORM queries
```

### 7. Frontend — React + Vite + TailwindCSS + shadcn/ui

```
WHY this stack:
  - Two interfaces: admin dashboard + client portal — neither needs SSR
  - shadcn/ui gives production-ready components (tables, forms, modals)
  - TailwindCSS = fast styling, consistent design
  - Vite = instant dev server, fast builds

WHY NOT Next.js:
  - No SSR needed (both interfaces behind auth)
  - No SEO needed
  - Adds server complexity for zero benefit here
```

---

## System Architecture (High-Level)

```
+-----------------------------------------------------------------+
|                          INTERNET                               |
|                                                                 |
|   Incoming Email --> MX DNS --> Your VPS IP (port 25)           |
|   Outgoing Email <-- SPF/DKIM/DMARC verified (port 25)         |
|   Users ----------> IMAPS (993) / SMTP Submission (587)         |
|   Admins ---------> HTTPS (443) wenvia.global/admin             |
|   Clients --------> HTTPS (443) wpanel.wenvia.global/portal    |
+--------+------------------+-------------------+-----------------+
         |                  |                   |
+--------v------------------v-------------------v-----------------+
|                   VPS (Ubuntu 22.04+)                           |
|                                                                 |
|  +------------------- HOST SERVICES ------------------------+  |
|  |                                                           |  |
|  |  +-----------+  +-----------+  +------------+            |  |
|  |  |  Postfix   |  |  Dovecot  |  |  Rspamd    |            |  |
|  |  |  SMTP      |  |  IMAP     |  |  Spam      |            |  |
|  |  |  25, 587   |  |  993      |  |  Filter    |            |  |
|  |  +-----+------+  +-----+-----+  +-----+------+           |  |
|  |        |               |               |                  |  |
|  |        |     +---------v---------+     |                  |  |
|  |        +---->|   PostgreSQL      |<----+                  |  |
|  |              |   (SQL lookups)   |                         |  |
|  |              +-------------------+                         |  |
|  |                                                           |  |
|  |  +-----------+  +-----------+                             |  |
|  |  |  Nginx    |  |  Certbot  |                             |  |
|  |  |  443->web |  |  TLS      |                             |  |
|  |  +-----------+  +-----------+                             |  |
|  +-----------------------------------------------------------+  |
|                                                                 |
|  +------------------- DOCKER COMPOSE -------------------------+  |
|  |                                                           |  |
|  |  +-------------------------------------------------+      |  |
|  |  |  Backend (Node.js + Fastify)                    |      |  |
|  |  |  +----------+ +----------+ +-----------------+  |      |  |
|  |  |  | Admin    | | Workers  | | Client Portal   |  |      |  |
|  |  |  | API      | | BullMQ   | | API             |  |      |  |
|  |  |  | Routes   | | Jobs     | | Routes          |  |      |  |
|  |  |  +----------+ +----------+ +-----------------+  |      |  |
|  |  +---------+--------------------+------------------+      |  |
|  |            |                    |                          |  |
|  |  +---------v-------+  +--------v-------------------+      |  |
|  |  |  PostgreSQL 16  |  |  Redis 7                   |      |  |
|  |  |  Main database  |  |  Sessions + Jobs + Rates   |      |  |
|  |  |  Port 5432      |  |  Port 6379                 |      |  |
|  |  +-----------------+  +----------------------------+      |  |
|  |                                                           |  |
|  |  +--------------+  +--------------+                       |  |
|  |  |  Frontend    |  |  Roundcube   |                       |  |
|  |  |  React SPA   |  |  Webmail     |                       |  |
|  |  |  Port 8080   |  |  Port 9000   |                       |  |
|  |  +--------------+  +--------------+                       |  |
|  +-----------------------------------------------------------+  |
|                                                                 |
|  +------------------- MAIL STORAGE ---------------------------+  |
|  |  /var/mail/vhosts/{domain}/{user}/                        |  |
|  |    cur/  new/  tmp/  .Sent/  .Drafts/  .Trash/  .Junk/   |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

---

## Technology Stack

### Mail Infrastructure (Host)

| Component    | Technology              | Purpose                     |
|-------------|------------------------|-----------------------------|
| SMTP        | **Postfix 3.8+**       | Send & receive emails       |
| IMAP        | **Dovecot 2.3+**       | Mailbox access for users    |
| Spam Filter | **Rspamd 3.x**         | Spam scoring, greylisting, RBL/DNSBL, DKIM signing, per-user rate limiting |
| Antivirus   | **ClamAV**             | Attachment scanning         |
| Webmail     | **Roundcube** (Docker) | Browser-based email client  |
| TLS         | **Let's Encrypt**      | Free SSL certificates       |
| Proxy       | **Nginx**              | Reverse proxy, TLS termination |
| Firewall    | **UFW + Fail2ban**     | Port control + brute-force block (ignoreip: 172.22.22.0/24 gateway, 172.17.0.0/16 Docker) |

> Note: Rspamd handles DKIM signing natively — no separate OpenDKIM needed.
> This simplifies the stack (one less service to configure).

### Application Stack (Docker)

| Layer        | Technology                  | Why This                          |
|-------------|----------------------------|-----------------------------------|
| Runtime     | **Node.js 22 LTS**         | Async I/O, large ecosystem        |
| Framework   | **Fastify 5**              | 2x faster than Express, schema validation built-in |
| Language    | **TypeScript 5.x**         | Type safety across entire backend |
| ORM         | **Drizzle ORM**            | SQL-close, lightweight, great migrations (pool=50) |
| Database    | **PostgreSQL 16**          | Postfix/Dovecot direct SQL, JSONB, proven (max_connections=300) |
| Cache/Queue | **Redis 7**                | Sessions, BullMQ backend, rate limits |
| Job Queue   | **BullMQ**                 | Background workers on Redis (requires Redis 5+) |
| Validation  | **Zod**                    | Runtime schema validation         |
| Auth        | **JWT (@fastify/jwt) + argon2** | Dual auth (admin + client), modern hashing |
| 2FA         | **otpauth + qrcode**           | TOTP two-factor authentication             |
| Logging     | **Pino**                   | Structured JSON logs, fast        |
| Frontend    | **React 19 + Vite 6**     | Fast SPA for admin dashboard + client portal |
| UI Kit      | **shadcn/ui + TailwindCSS 4** | Production-ready components    |
| Rich Text   | **Tiptap** (@tiptap/react, starter-kit, extension-link, extension-underline, extension-placeholder) | Compose editor (bold/italic/underline/lists/links/quotes/undo-redo) |
| HTTP Client | **ky** (frontend)          | Lightweight fetch wrapper         |
| Router      | **React Router 7**        | Client-side routing               |
| State       | **TanStack Query**         | Server state management, caching  |

### DevOps

| Tool         | Purpose                              |
|-------------|--------------------------------------|
| **Docker Compose** | Local dev + production deployment |
| **GitHub Actions** | CI/CD (lint, test, build, deploy) |

---

## Database Schema (PostgreSQL)

### Tables

```sql
-- ============================================
-- PLANS (must exist before clients)
-- ============================================

CREATE TABLE plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(100) NOT NULL,
    max_domains             INT NOT NULL DEFAULT 1,
    max_mailboxes           INT NOT NULL DEFAULT 50,
    max_aliases             INT NOT NULL DEFAULT 200,
    storage_per_mailbox_mb  INT NOT NULL DEFAULT 500,
    max_send_per_day        INT NOT NULL DEFAULT 500,
    price_monthly           DECIMAL(10,2) DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADMINS (platform operators)
-- ============================================

CREATE TABLE admins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) DEFAULT 'admin',
    totp_secret     VARCHAR(255),                -- 2FA TOTP secret (base32)
    totp_enabled    BOOLEAN DEFAULT FALSE,       -- whether 2FA is active
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLIENTS (tenants) — with billing and override fields
-- ============================================

CREATE TABLE clients (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(255) NOT NULL,
    slug                  VARCHAR(100) UNIQUE NOT NULL,
    contact_email         VARCHAR(255) NOT NULL,
    contact_phone         VARCHAR(50),
    plan_id               UUID NOT NULL REFERENCES plans(id),
    status                VARCHAR(20) DEFAULT 'active',        -- active, suspended, cancelled
    billing_status        VARCHAR(20) DEFAULT 'active',        -- active, overdue, suspended, trial
    trial_ends_at         TIMESTAMPTZ,
    service_enabled_at    TIMESTAMPTZ DEFAULT NOW(),
    service_disabled_at   TIMESTAMPTZ,
    max_mailbox_override  INT,                                  -- admin override of plan limit
    max_domain_override   INT,                                  -- admin override of plan limit
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLIENT USERS (client-side login accounts)
-- ============================================

CREATE TABLE client_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(20) DEFAULT 'owner',     -- owner, manager
    status          VARCHAR(20) DEFAULT 'active',
    last_login_at   TIMESTAMPTZ,
    totp_secret     VARCHAR(255),                -- 2FA TOTP secret (base32)
    totp_enabled    BOOLEAN DEFAULT FALSE,       -- whether 2FA is active
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVOICES
-- ============================================

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    invoice_number  VARCHAR(50) UNIQUE NOT NULL,      -- e.g. INV-2026-A1B2C3D4
    amount          DECIMAL(10,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    status          VARCHAR(20) DEFAULT 'pending',    -- pending, paid, overdue, cancelled
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    due_date        TIMESTAMPTZ NOT NULL,
    paid_at         TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id),
    client_id       UUID NOT NULL REFERENCES clients(id),
    amount          DECIMAL(10,2) NOT NULL,
    method          VARCHAR(30) NOT NULL,              -- bank_transfer, card, upi, manual
    transaction_ref VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'completed',   -- completed, refunded, failed
    notes           TEXT,
    paid_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DOMAINS
-- ============================================

CREATE TABLE domains (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    domain_name         VARCHAR(255) UNIQUE NOT NULL,
    verification_token  VARCHAR(255) NOT NULL,
    verified            BOOLEAN DEFAULT FALSE,
    mx_configured       BOOLEAN DEFAULT FALSE,
    spf_configured      BOOLEAN DEFAULT FALSE,
    dkim_configured     BOOLEAN DEFAULT FALSE,
    dmarc_configured    BOOLEAN DEFAULT FALSE,
    dkim_private_key    TEXT,
    dkim_public_key     TEXT,
    dkim_selector       VARCHAR(50) DEFAULT 'mail',
    status              VARCHAR(20) DEFAULT 'pending',
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MAILBOXES
-- ============================================

CREATE TABLE mailboxes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    local_part      VARCHAR(64) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    quota_mb        INT NOT NULL DEFAULT 500,
    storage_used_mb INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'active',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(domain_id, local_part)
);

-- ============================================
-- ALIASES
-- ============================================

CREATE TABLE aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    source_local    VARCHAR(64) NOT NULL,
    destination     TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(domain_id, source_local)
);

-- ============================================
-- MAIL LOGS
-- ============================================

CREATE TABLE mail_logs (
    id               BIGSERIAL PRIMARY KEY,
    domain_id        UUID REFERENCES domains(id),
    mailbox_id       UUID REFERENCES mailboxes(id),
    direction        VARCHAR(10) NOT NULL,
    from_address     VARCHAR(255),
    to_address       VARCHAR(255),
    subject          VARCHAR(500),
    message_id       VARCHAR(500),
    status           VARCHAR(20),
    size_bytes       INT,
    postfix_queue_id VARCHAR(50),
    error_message    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DNS CHECKS
-- ============================================

CREATE TABLE dns_checks (
    id          BIGSERIAL PRIMARY KEY,
    domain_id   UUID NOT NULL REFERENCES domains(id),
    check_type  VARCHAR(20) NOT NULL,
    status      VARCHAR(20) NOT NULL,
    raw_result  TEXT,
    checked_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLATFORM SETTINGS (key-value config store)
-- ============================================

CREATE TABLE platform_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    label       VARCHAR(255),        -- human-readable label for admin UI
    "group"     VARCHAR(50),         -- server, mail, branding, relay
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Default keys:
--   server.hostname         -> Mail server hostname (e.g. mail.yourplatform.com)
--   server.ip               -> VPS public IP
--   server.webmail_url      -> Roundcube URL
--   mail.postmaster_email   -> Postmaster email
--   mail.dmarc_email        -> DMARC report email
--   mail.max_attachment_mb  -> Max attachment size
--   branding.platform_name  -> Platform display name
--   branding.support_email  -> Support contact email
--   relay.mode              -> direct or relay (delivery method)
--   relay.host              -> SMTP relay hostname
--   relay.port              -> SMTP relay port
--   relay.username           -> SMTP relay username
--   relay.password           -> SMTP relay password

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    actor_type  VARCHAR(20) NOT NULL,
    actor_id    UUID,
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   UUID,
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PASSWORD RESET REQUESTS (DB-based, no email)
-- ============================================

CREATE TABLE password_reset_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id  UUID NOT NULL REFERENCES client_users(id),
    client_id       UUID NOT NULL REFERENCES clients(id),
    mailbox_id      UUID REFERENCES mailboxes(id),        -- set when request_type = 'mailbox'
    email           VARCHAR(255) NOT NULL,
    request_type    VARCHAR(20) DEFAULT 'portal',          -- portal (client user) | mailbox (mail user)
    status          VARCHAR(20) DEFAULT 'pending',         -- pending, completed, rejected
    resolved_by     UUID REFERENCES admins(id),
    resolved_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BLOCKLIST (custom bans: IP, email, domain)
-- ============================================

CREATE TABLE blocklist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(20) NOT NULL,       -- ip, email, domain
    value       VARCHAR(255) NOT NULL,
    reason      TEXT,
    permanent   BOOLEAN DEFAULT FALSE,
    expires_at  TIMESTAMPTZ,
    created_by  UUID REFERENCES admins(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS (centralized notification system)
-- ============================================

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL,       -- admin, client
    target_id   UUID,                        -- client_id for client notifications, null for admin
    type        VARCHAR(50) NOT NULL,        -- password_reset, migration_complete, migration_failed, etc.
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    action_url  VARCHAR(500),                -- optional deep-link URL
    severity    VARCHAR(20) DEFAULT 'info',  -- info, warning, error, success
    read        BOOLEAN DEFAULT FALSE,
    dismissed   BOOLEAN DEFAULT FALSE,
    metadata    JSONB,                       -- flexible extra data
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCHEDULED EMAILS (deferred send)
-- ============================================

CREATE TABLE scheduled_emails (
    id                BIGSERIAL PRIMARY KEY,
    sender            VARCHAR(255) NOT NULL,
    "to"              TEXT NOT NULL,
    cc                TEXT,
    bcc               TEXT,
    subject           VARCHAR(500),
    text              TEXT,
    html              TEXT,
    attachments_json  JSONB,
    scheduled_at      TIMESTAMPTZ NOT NULL,
    status            VARCHAR(20) DEFAULT 'pending',   -- pending, sent, failed
    sent_at           TIMESTAMPTZ,
    error             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FILTER RULES (server-side mail filtering)
-- ============================================

CREATE TABLE filter_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    condition       VARCHAR(20) NOT NULL,        -- from, to, subject, any
    match_type      VARCHAR(20) NOT NULL,        -- contains, is, starts_with
    match_value     VARCHAR(255) NOT NULL,
    action          VARCHAR(20) NOT NULL,        -- move, delete, mark_read, forward
    action_value    VARCHAR(255),                -- target folder, forward address, etc.
    enabled         BOOLEAN DEFAULT TRUE,
    priority        INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUTO RESPONDERS (vacation reply)
-- ============================================

CREATE TABLE auto_responders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT FALSE,
    subject         VARCHAR(500),
    body            TEXT,
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CATCH-ALL RULES (domain-level catch-all)
-- ============================================

CREATE TABLE catch_all_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id       UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    enabled         BOOLEAN DEFAULT FALSE,
    forward_to      VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FORWARDING RULES (per-mailbox forwarding)
-- ============================================

CREATE TABLE forwarding_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id      UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    forward_to      VARCHAR(255) NOT NULL,
    keep_copy       BOOLEAN DEFAULT TRUE,
    enabled         BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Relationships

```
plans 1--* clients
clients 1--* client_users
clients 1--* domains
clients 1--* mailboxes
clients 1--* aliases
clients 1--* notifications (target_type='client', target_id=client_id)
clients 1--* invoices
invoices 1--* payments
domains 1--* mailboxes
domains 1--* aliases
domains 1--* dns_checks
client_users 1--* password_reset_requests
mailboxes 1--* password_reset_requests (mailbox_id, for mailbox resets)
mailboxes 1--* filter_rules
mailboxes 1--* auto_responders
mailboxes 1--* forwarding_rules
domains 1--* catch_all_rules
admins 1--* password_reset_requests (resolved_by)
```

---

## Backend Structure

```
backend/
├── src/
│   ├── app.ts                         # Fastify app setup, plugin registration, all route mounting
│   ├── server.ts                      # Entry point — start server + workers (non-fatal)
│   ├── seed.ts                        # Database seeder
│   │
│   ├── config/
│   │   └── env.ts                     # Zod-validated environment variables
│   │
│   ├── db/
│   │   ├── index.ts                   # Drizzle client instance
│   │   ├── schema.ts                  # ALL Drizzle table definitions (21 tables)
│   │   └── migrations/               # SQL migration files (drizzle-kit)
│   │       ├── 0001_*.sql             # Initial schema
│   │       └── 0002_fuzzy_chimera.sql # password_reset_requests table
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts         # POST /api/auth/login, /refresh, /logout
│   │   │   ├── auth.service.ts        # Token logic, password verify
│   │   │   └── auth.guard.ts          # Admin JWT guard (Fastify preHandler hook)
│   │   │
│   │   ├── client-portal/
│   │   │   ├── client-auth.routes.ts  # POST /api/client-portal/auth/login, /refresh, /me, /password
│   │   │   ├── client-auth.guard.ts   # Client JWT guard (checks type === "client")
│   │   │   ├── portal.routes.ts       # All client self-service: domains, mailboxes, aliases, logs, billing, migration
│   │   │   ├── notification.routes.ts # Client notification endpoints (list, read, dismiss, clear)
│   │   │   └── import-export.routes.ts # CSV bulk import, IMAP migration, export info
│   │   │
│   │   ├── clients/
│   │   │   ├── client.routes.ts       # Admin CRUD for clients
│   │   │   ├── client.service.ts
│   │   │   └── client.schema.ts       # Zod schemas for req/res validation
│   │   │
│   │   ├── domains/
│   │   │   ├── domain.routes.ts       # Admin domain management
│   │   │   ├── domain.service.ts
│   │   │   └── dns.service.ts         # DNS record verification via node:dns
│   │   │
│   │   ├── mailboxes/
│   │   │   ├── mailbox.routes.ts      # Admin mailbox management
│   │   │   └── mailbox.service.ts
│   │   │
│   │   ├── aliases/
│   │   │   ├── alias.routes.ts        # Admin alias management
│   │   │   └── alias.service.ts
│   │   │
│   │   ├── plans/
│   │   │   ├── plan.routes.ts         # Plan CRUD
│   │   │   └── plan.service.ts
│   │   │
│   │   ├── logs/
│   │   │   ├── log.routes.ts          # Admin mail + audit log access
│   │   │   └── log.service.ts
│   │   │
│   │   ├── dashboard/
│   │   │   └── dashboard.routes.ts    # Admin aggregate stats endpoint
│   │   │
│   │   ├── billing/
│   │   │   └── billing.routes.ts      # Invoices, payments, client controls, client user management, billing overview
│   │   │
│   │   ├── server-health/
│   │   │   └── health.routes.ts       # System info, DB/Redis/mail status, disk usage, metrics, Rspamd stats, Fail2ban, SSL expiry, IMAP connections
│   │   │
│   │   ├── abuse/
│   │   │   └── abuse.routes.ts        # Rspamd stats, high volume senders, bounce tracking, alerts
│   │   │
│   │   ├── bans/
│   │   │   └── bans.routes.ts         # Fail2ban IP view/ban/unban, custom blocklist CRUD with Rspamd sync, audit logged
│   │   │
│   │   ├── settings/
│   │   │   ├── settings.routes.ts     # GET/PUT /api/admin/settings
│   │   │   └── settings.service.ts    # getSetting(), getAllSettings(), updateSettings(), buildDnsInstructions()
│   │   │
│   │   ├── notifications/
│   │   │   └── notification.routes.ts # Admin notification endpoints (list, read, dismiss, clear)
│   │   │
│   │   └── webmail/
│   │       ├── webmail.routes.ts      # Webmail IMAP endpoints (folders, messages, compose, search)
│   │       ├── contacts.ts            # Contact management (Redis sorted set, auto-record recipients)
│   │       ├── templates.ts           # Pre-built email templates (Welcome, Meeting, Invoice, etc.)
│   │       ├── totp.routes.ts         # 2FA TOTP setup/verify/disable/status
│   │       └── mail-features.routes.ts # Labels, filter rules, auto-responder, catch-all, forwarding
│   │
│   ├── workers/
│   │   ├── index.ts                   # Register all workers, check Redis version, set schedules
│   │   ├── queues.ts                  # Queue definitions + shared Redis connection
│   │   ├── dns-check.worker.ts        # Periodic: verify DNS for all domains (hourly)
│   │   ├── quota-sync.worker.ts       # Periodic: calculate mailbox sizes (every 6h)
│   │   ├── log-cleanup.worker.ts      # Periodic: purge old logs (daily at 3 AM)
│   │   ├── domain-setup.worker.ts     # On-demand: verify domain + gen DKIM
│   │   ├── mail-log.worker.ts         # Periodic: parse Postfix syslog -> mail_logs table (every 5 min)
│   │   └── scheduled-send.worker.ts  # Periodic: send scheduled emails (every minute)
│   │
│   ├── mail/
│   │   ├── postfix.ts                 # Execute postfix reload, reloadPostfix(), reloadDovecot()
│   │   ├── dovecot.ts                 # Execute doveadm commands
│   │   └── welcome.ts                 # Send welcome email with IMAP/SMTP setup to new mailboxes
│   │
│   └── lib/
│       ├── password.ts                # hashPassword (argon2), hashPasswordForDovecot (SHA512-CRYPT), verifyPassword
│       ├── logger.ts                  # Pino logger instance
│       ├── redis.ts                   # ioredis client instance
│       ├── errors.ts                  # AppError, NotFoundError, ConflictError, LimitExceededError
│       └── notify.ts                  # Centralized notification service: notify(), notifyAdmin(), notifyClient()
│
├── drizzle.config.ts                  # Drizzle Kit config
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Infrastructure Configs (Saved)

```
infra/                                     # Sanitized infrastructure configs (committed to repo)
├── nginx/                                 # Nginx site configs
├── postfix/                               # Postfix main.cf, master.cf
├── dovecot/                               # Dovecot configs
├── rspamd/                                # Rspamd local.d configs
└── fail2ban/                              # Fail2ban jail configs
```

---

## Frontend Structure

```
frontend/
├── src/
│   ├── main.tsx                       # React entry
│   ├── App.tsx                        # Router setup (admin + portal routes)
│   │
│   ├── api/
│   │   ├── client.ts                  # ky instance with admin auth interceptor
│   │   ├── auth.ts                    # Admin login/logout API calls
│   │   ├── clients.ts                 # Client API calls
│   │   ├── domains.ts                 # Domain API calls
│   │   ├── mailboxes.ts              # Mailbox API calls
│   │   ├── portal.ts                  # Client portal API calls
│   │   └── admin.ts                   # Admin-specific API calls (billing, health, settings)
│   │
│   ├── pages/
│   │   │
│   │   ├── landing.tsx                 # Public landing page (features, pricing, 3-step guide)
│   │   │
│   │   │  ── ADMIN PAGES ──
│   │   ├── login.tsx                  # Admin login (at /admin/login)
│   │   ├── dashboard.tsx              # Admin dashboard (aggregate stats)
│   │   ├── clients/
│   │   │   ├── list.tsx               # All clients
│   │   │   └── detail.tsx             # Single client detail
│   │   ├── domains/
│   │   │   ├── list.tsx               # All domains
│   │   │   ├── detail.tsx             # Domain detail with DNS status
│   │   │   └── dns-guide.tsx          # DNS setup wizard
│   │   ├── mailboxes/
│   │   │   └── list.tsx               # All mailboxes
│   │   ├── aliases/
│   │   │   └── list.tsx               # All aliases
│   │   ├── logs/
│   │   │   ├── mail.tsx               # Mail logs
│   │   │   └── audit.tsx              # Audit trail
│   │   ├── admin/
│   │   │   ├── server-health.tsx      # CPU, RAM, disk, services, Rspamd stats, Fail2ban, SSL expiry, IMAP connections
│   │   │   ├── abuse.tsx              # Abuse Monitor: Rspamd stats, high volume senders, bounce tracking, outbound by client, auto-refresh alerts
│   │   │   ├── bans.tsx               # Ban Management: Fail2ban IP view/ban/unban, custom blocklist (email/domain/IP) with Rspamd sync, audit logged
│   │   │   ├── client-controls.tsx    # Service toggle, limit overrides per client
│   │   │   ├── billing.tsx            # Invoices, payments, billing overview
│   │   │   └── settings.tsx           # Platform settings (hostname, IP, DMARC email, etc.)
│   │   │
│   │   │  ── WEBMAIL PAGES ──
│   │   ├── mail/
│   │   │   └── contacts.tsx           # Contact management (search, add, delete, compose-to, avatars)
│   │   │
│   │   │  ── CLIENT PORTAL PAGES ──
│   │   └── portal/
│   │       ├── login.tsx              # Client login
│   │       ├── dashboard.tsx          # Client dashboard (their stats + limits)
│   │       ├── getting-started.tsx    # Onboarding guide for new clients
│   │       ├── domains.tsx            # Client's domains list
│   │       ├── dns-setup.tsx          # Personalized DNS setup instructions (uses buildDnsInstructions)
│   │       ├── mailboxes.tsx          # Client's mailboxes (per domain)
│   │       ├── aliases.tsx            # Client's aliases (per domain)
│   │       ├── logs.tsx               # Client's mail logs (their domains only)
│   │       ├── billing.tsx            # Client's invoices and payments
│   │       └── migration.tsx          # Import/export instructions
│   │
│   ├── components/
│   │   ├── layout.tsx                 # Admin shell: sidebar + header + content
│   │   ├── portal-layout.tsx          # Client portal shell: sidebar + header + content
│   │   ├── data-table.tsx             # Reusable table with sorting/pagination
│   │   ├── dns-status-badge.tsx       # Color-coded DNS record status
│   │   ├── quota-bar.tsx              # Storage usage bar
│   │   ├── stat-card.tsx              # Dashboard stat cards
│   │   ├── email-chips.tsx            # Gmail-style email chips (To/CC/BCC) — type+Enter, X remove, double-click edit, paste multiple
│   │   ├── rich-editor.tsx            # Tiptap rich text editor (bold/italic/underline/lists/links/quotes/undo-redo)
│   │   ├── notification-bell.tsx      # Bell dropdown with unread count badge, actions: navigate, mark read, dismiss
│   │   ├── sender-avatar.tsx         # Colored circle with initial letter (hash-based color from 10-color palette)
│   │   └── locale-switcher.tsx       # EN/हि language toggle component
│   │
│   ├── hooks/
│   │   ├── use-auth.ts               # Admin auth state
│   │   ├── use-portal-auth.ts        # Client portal auth state
│   │   └── use-locale.ts             # LocaleContext, useLocale() hook, useLocaleProvider()
│   │
│   ├── i18n/
│   │   └── translations.ts           # Multi-language strings (en, hi) — 100+ keys across common, auth, mail, portal, landing
│   │
│   └── lib/
│       └── utils.ts                   # cn() helper, formatters
│
├── index.html
├── vite.config.ts
├── components.json                    # shadcn/ui config
├── package.json
└── Dockerfile
```

---

## API Routes

### Admin Routes (JWT type: admin)

| Method | Route                             | Purpose                                    |
|--------|-----------------------------------|--------------------------------------------|
| POST   | /api/auth/login                   | Admin login                                |
| POST   | /api/auth/refresh                 | Refresh admin token                        |
| POST   | /api/auth/logout                  | Admin logout                               |
| GET    | /api/dashboard                    | Aggregate stats                            |
| GET    | /api/clients                      | List all clients                           |
| POST   | /api/clients                      | Create client                              |
| GET    | /api/clients/:id                  | Get client detail                          |
| PUT    | /api/clients/:id                  | Update client                              |
| DELETE | /api/clients/:id                  | Delete client                              |
| GET    | /api/domains                      | List all domains                           |
| POST   | /api/domains                      | Create domain                              |
| GET    | /api/mailboxes                    | List all mailboxes                         |
| POST   | /api/mailboxes                    | Create mailbox                             |
| GET    | /api/aliases                      | List all aliases                           |
| POST   | /api/aliases                      | Create alias                               |
| GET    | /api/plans                        | List plans                                 |
| POST   | /api/plans                        | Create plan                                |
| GET    | /api/logs/mail                    | Mail logs (paginated)                      |
| GET    | /api/logs/audit                   | Audit trail (paginated)                    |
| PUT    | /api/admin/clients/:id/controls   | Service toggle, limit overrides, billing status |
| GET    | /api/admin/clients/:id/billing    | Client billing summary                     |
| GET    | /api/admin/clients/:id/users      | List client portal users                   |
| POST   | /api/admin/client-users           | Create client portal user                  |
| GET    | /api/admin/invoices               | List all invoices                          |
| POST   | /api/admin/invoices               | Create invoice                             |
| PUT    | /api/admin/invoices/:id/status    | Update invoice status                      |
| POST   | /api/admin/payments               | Record payment                             |
| GET    | /api/admin/billing/overview       | Platform-wide billing stats                |
| GET    | /api/admin/server/health          | Full system health (CPU, RAM, disk, DB, Redis, mail services) |
| GET    | /api/admin/server/metrics         | Lightweight metrics for polling            |
| GET    | /api/admin/settings               | Get all platform settings                  |
| PUT    | /api/admin/settings               | Update platform settings                   |
| GET    | /api/admin/password-resets        | List all password reset requests           |
| PUT    | /api/admin/password-resets/:id    | Resolve reset request (set new password)   |
| GET    | /api/admin/bans/fail2ban          | List Fail2ban banned IPs                   |
| POST   | /api/admin/bans/fail2ban          | Manually ban an IP via Fail2ban            |
| POST   | /api/admin/bans/fail2ban/unban    | Unban an IP from Fail2ban                  |
| GET    | /api/admin/bans/blocklist         | List custom blocklist entries               |
| POST   | /api/admin/bans/blocklist         | Add blocklist entry (IP/email/domain)       |
| DELETE | /api/admin/bans/blocklist         | Remove blocklist entry                      |
| GET    | /api/admin/abuse/overview         | Abuse overview (Rspamd stats, high volume, bounces) |
| GET    | /api/admin/abuse/alerts           | Active abuse alerts (auto-refresh)          |
| GET    | /api/admin/abuse/abnormal-recipients | Recipients with high bounce rates (last 7d) |
| GET    | /api/admin/notifications          | List admin notifications                   |
| GET    | /api/admin/notifications/unread-count | Unread notification count                |
| PUT    | /api/admin/notifications/:id/read | Mark notification as read                  |
| PUT    | /api/admin/notifications/:id/dismiss | Dismiss notification                    |
| POST   | /api/admin/notifications/mark-all-read | Mark all notifications read           |
| POST   | /api/admin/notifications/clear-all | Clear all notifications                  |
| GET    | /api/health                       | Public health check                        |
| POST   | /api/auth/totp/setup              | Generate TOTP secret + QR code             |
| POST   | /api/auth/totp/verify             | Validate 6-digit code, enable 2FA          |
| POST   | /api/auth/totp/disable            | Disable 2FA                                |
| GET    | /api/auth/totp/status             | Check if 2FA is enabled                    |

### Client Portal Routes (JWT type: client)

| Method | Route                                          | Purpose                                |
|--------|-------------------------------------------------|----------------------------------------|
| POST   | /api/client-portal/auth/login                  | Client login                           |
| POST   | /api/client-portal/auth/refresh                | Refresh client token                   |
| GET    | /api/client-portal/auth/me                     | Current user profile                   |
| PUT    | /api/client-portal/auth/password               | Change password                        |
| POST   | /api/client-portal/auth/forgot-password        | Submit password reset request (public)  |
| GET    | /api/client-portal/dashboard                   | Client stats + plan limits             |
| GET    | /api/client-portal/domains                     | Client's domains                       |
| POST   | /api/client-portal/domains                     | Add domain (with DKIM generation)      |
| POST   | /api/client-portal/domains/:id/verify          | Trigger DNS verification               |
| GET    | /api/client-portal/domains/:id/dns-status      | Live DNS check results                 |
| GET    | /api/client-portal/domains/:id/dns-guide       | Personalized DNS setup instructions    |
| DELETE | /api/client-portal/domains/:id                 | Disable domain                         |
| GET    | /api/client-portal/domains/:domainId/mailboxes | List mailboxes for domain              |
| POST   | /api/client-portal/domains/:domainId/mailboxes | Create mailbox (checks plan limits)    |
| PUT    | /api/client-portal/mailboxes/:id               | Update mailbox (password, name, status)|
| DELETE | /api/client-portal/mailboxes/:id               | Disable mailbox                        |
| GET    | /api/client-portal/domains/:domainId/aliases   | List aliases for domain                |
| POST   | /api/client-portal/domains/:domainId/aliases   | Create alias (checks plan limits)      |
| DELETE | /api/client-portal/aliases/:id                 | Delete alias                           |
| GET    | /api/client-portal/logs                        | Client's mail logs (paginated)         |
| GET    | /api/client-portal/billing                     | Client's invoices + payments           |
| GET    | /api/client-portal/mail-settings               | IMAP/SMTP/webmail config from settings |
| GET    | /api/client-portal/migration/info              | Import/export instructions             |
| GET    | /api/client-portal/notifications               | List client notifications              |
| GET    | /api/client-portal/notifications/unread-count  | Unread notification count              |
| PUT    | /api/client-portal/notifications/:id/read      | Mark notification as read              |
| PUT    | /api/client-portal/notifications/:id/dismiss   | Dismiss notification                   |
| POST   | /api/client-portal/notifications/mark-all-read | Mark all notifications read            |
| POST   | /api/client-portal/notifications/clear-all     | Clear all notifications                |
| DELETE | /api/client-portal/password-resets/:id         | Dismiss/reject password reset request  |
| POST   | /api/client-portal/import/csv                  | CSV bulk mailbox creation              |
| GET    | /api/client-portal/import/csv-template         | Download CSV template                  |
| POST   | /api/client-portal/import/imap                 | IMAP sync migration (via imapsync)     |
| GET    | /api/client-portal/export/info                 | Export instructions and info           |
| POST   | /api/webmail/ensure-folder                     | Ensure IMAP folder exists               |
| POST   | /api/webmail/change-password                   | Change mailbox password from webmail    |
| GET    | /api/webmail/contacts                          | List/search contacts (Redis sorted set) |
| POST   | /api/webmail/contacts                          | Add contact manually                    |
| DELETE | /api/webmail/contacts                          | Remove contact                          |
| GET    | /api/webmail/templates                         | List pre-built email templates          |
| POST   | /api/webmail/schedule                          | Schedule email for later sending        |
| GET    | /api/webmail/scheduled                         | List user's scheduled emails            |
| DELETE | /api/webmail/scheduled/:id                     | Cancel scheduled email                  |
| POST   | /api/webmail/label                             | Add/remove IMAP keyword labels          |
| GET    | /api/client-portal/users                       | List portal users                       |
| POST   | /api/client-portal/users                       | Create manager account (owner only)     |
| GET    | /api/client-portal/auto-responder/:mailboxId   | Get auto-responder settings             |
| PUT    | /api/client-portal/auto-responder/:mailboxId   | Update auto-responder (vacation reply)  |
| GET    | /api/client-portal/catch-all/:domainId         | Get catch-all rule for domain           |
| PUT    | /api/client-portal/catch-all/:domainId         | Update catch-all forwarding rule        |
| GET    | /api/client-portal/forwarding/:mailboxId       | Get forwarding rules for mailbox        |
| POST   | /api/client-portal/forwarding/:mailboxId       | Add forwarding rule                     |
| DELETE | /api/client-portal/forwarding/:mailboxId       | Remove forwarding rule                  |

---

## Key Features

### Platform Settings System

The `platform_settings` table is a key-value store configurable from the admin UI. Settings are grouped (server, mail, branding, relay) and each has a human-readable label plus a hint explaining what it does and how to fill it. The service layer provides defaults and falls back to environment variables when DB values are missing.

Used by `buildDnsInstructions()` to generate personalized, step-by-step DNS setup guides for each client domain. The instructions include the actual server hostname, IP, and DMARC email from settings so clients get copy-paste-ready DNS records. Admin settings page shows hints in blue below each field so the platform operator knows exactly what each setting controls.

### Client Controls

Admin can per-client:
- Toggle service status (active / suspended / cancelled)
- Override plan limits (max mailboxes, max domains) without changing the plan
- Set billing status (active / overdue / suspended / trial)
- Suspended clients are blocked from portal login and all portal API calls

### Server Health Monitoring

The `/api/admin/server/health` endpoint gathers:
- **System**: hostname, OS, CPU model/cores/load, memory usage
- **PostgreSQL**: connection latency, database size, active connections
- **Redis**: ping latency, memory usage, total keys
- **Mail services**: systemctl status for Postfix, Dovecot, Rspamd + mail queue size
- **Disk**: filesystem usage for / and /var/mail
- **Rspamd**: spam/ham stats, action breakdown
- **Fail2ban**: jail status, banned IP count per jail
- **SSL certificates**: expiry date per domain
- **IMAP connections**: active Dovecot IMAP connection count

A lightweight `/api/admin/server/metrics` endpoint is available for frequent polling.

### DNS Guide System

When a client adds a domain, both the admin and client portal provide personalized DNS instructions.
The `buildDnsInstructions()` function reads platform_settings (hostname, server IP, DMARC email) and generates 5 step-by-step records:
1. TXT verification record (ownership proof)
2. MX record pointing to platform mail server (e.g., `mail.wenvia.global`)
3. SPF TXT record (includes server IP for sender authorization)
4. DKIM TXT record (from auto-generated 2048-bit RSA keypair)
5. DMARC TXT record (with platform's DMARC report email)

DNS instructions are **never hardcoded** — they pull from `platform_settings` so all clients
get the same server hostname/IP, and changing it in Settings updates every client's guide instantly.

The admin domain detail page also shows the DNS guide with copy buttons alongside the PASS/FAIL status cards.
DNS verification (`dns.service.ts`) checks MX against both `server.hostname` and `PLATFORM_DOMAIN`,
and SPF checks validate against hostname, IP, and `PLATFORM_DOMAIN`.

**DNS pattern for ALL clients (same template, client fills in their domain):**
```
A     mail.yourplatform.com       -> <server.ip>                   (one-time platform setup)
MX    clientdomain.com            -> mail.yourplatform.com (pri 10)
TXT   clientdomain.com            -> mailplatform-verify=<token>
TXT   clientdomain.com            -> v=spf1 ip4:<server.ip> include:<hostname> ~all
TXT   mail._domainkey.clientdomain.com -> v=DKIM1; k=rsa; p=<generated>
TXT   _dmarc.clientdomain.com     -> v=DMARC1; p=quarantine; rua=mailto:<dmarc_email>
```

### Webmail (Roundcube)

Roundcube runs as a Docker container (port 9000) and is served via Nginx at `mail.wenvia.global`.
This is the browser-based email client — like `mail.google.com` but for your platform.
Branded as "WenMail" with custom logos, glossy indigo theme (light + dark mode), and watermark removed.
Custom branding files live in `roundcube-custom/` and are volume-mounted into the container.
A setup help page at `/setup-help.html` provides email client configuration instructions.
The support link in Roundcube points to this setup guide.

Any client's user can log in with their full email (`john@acme.com`) and password.
Roundcube connects to Dovecot (IMAP, port 993) for reading and Postfix (SMTP, port 587) for sending.

### Custom Webmail

In addition to Roundcube, WenMail includes a custom webmail client built into the platform.
IMAP connection pooling provides persistent connections per session (max 2 per mailbox),
backed by Redis sessions, resulting in 13-83x faster webmail performance.

**Compose Window:**
- Rich text editor (Tiptap) — bold, italic, underline, bullet/ordered lists, links, blockquotes, undo/redo
- Three-state window: minimize / default / expanded (95vw x 92vh)
- Gmail-style email chips for To/CC/BCC — type+Enter to add, X to remove, double-click to edit, paste multiple
- Drag-and-drop file attachments

**Webmail Settings** (4 tabs):
1. **General** — display name, page size
2. **Compose** — signature editor
3. **Account** — change password (strength indicator, confirm field, eye toggle)
4. **Mail Setup** — IMAP/SMTP connection info for external clients

**Webmail Auth:**
- Login cooldown: 5 failed attempts = 15 min lock per email address
- Forgot password: mail user submits request, client gets notification in portal

### Notification System

Centralized notification system backed by the `notifications` DB table. Both admin and client portal
layouts include a notification bell dropdown with unread count badge. Notifications support actions:
navigate (deep-link via action_url), mark read, and dismiss.

**Notification service** (`lib/notify.ts`): `notify()`, `notifyAdmin()`, `notifyClient()` — used to
create notifications programmatically. Auto-generated on: password resets, IMAP migration complete/fail.

**Notification types**: Admin sees `target_type='admin'` (portal password resets); client sees
`target_type='client'` (mailbox password resets, migration results). Each notification has a severity
level (info, warning, error, success) and optional metadata (JSONB).

**Bell dropdown component** (`notification-bell.tsx`): unread count badge, scrollable list,
per-notification actions (navigate, mark read, dismiss), bulk actions (mark all read, clear all).

### Password Reset Flows

Three DB-based reset flows (no email required):
1. **Mail user -> Client**: mailbox user requests reset via webmail forgot-password; client receives a notification (no banner)
2. **Client -> Admin**: client portal user requests reset via portal forgot-password; admin resolves from billing/password-resets page
3. **Password change modal**: used by both client portal and webmail — strength indicator, confirm field, eye toggle (replaced browser prompt)

The `password_reset_requests` table uses `request_type` ('portal' or 'mailbox') and optional `mailbox_id`
to distinguish between portal user resets and mailbox user resets. Admin sees only `portal` type requests;
client sees only `mailbox` type requests. Clients can dismiss/reject requests via
`DELETE /api/client-portal/password-resets/:id`.

### Login Cooldown

5 failed login attempts = 15 minute lock per email address. Applies to webmail login.
Prevents brute-force attacks at the application level (complements Fail2ban at the infrastructure level).

### Relay Configuration

Admin can switch outgoing email delivery between **direct** (Postfix delivers directly to recipient MX) and **SMTP relay** (routes through a third-party relay like SendGrid, Mailgun). Settings are in the `relay` group: `relay.mode`, `relay.host`, `relay.port`, `relay.username`, `relay.password`. On save, the backend writes `sasl_passwd`, runs `postmap`, and reloads Postfix automatically.

### Contact Management (Webmail)

Full contacts page at `/mail/contacts` with search, add, delete, and compose-to functionality. Contacts are stored in Redis sorted sets (`webmail:contacts:{email}`, max 200 per user). Recipients are auto-recorded when sending emails. Backend endpoints: `GET/POST/DELETE /api/webmail/contacts`.

### Multi-language (i18n)

Infrastructure for multi-language support. `translations.ts` contains `Record<Locale, Record<string, string>>` with 100+ translated strings across common, auth, mail, portal, and landing categories. Supported locales: English (`en`) and Hindi (`hi`). Uses `LocaleContext` + `useLocale()` hook with `LocaleSwitcher` component (EN/हि toggle). Locale persists in `localStorage` (`wenmail-locale`).

### Email Templates

6 pre-built templates: Welcome, Meeting Request, Invoice Reminder, Follow-up, Thank You, Announcement. Each has id, name, category, subject, html, and text fields. Templates use `[placeholder]` variables for customization. Served via `GET /api/webmail/templates`. Defined in `templates.ts` with `EmailTemplate` interface.

### Abnormal Recipient Detection

`GET /api/admin/abuse/abnormal-recipients` queries `mail_logs` for external recipients with high bounce rates over the last 7 days. Returns `toAddress`, total sent, bounced count, `bounceRate` %, and severity (`warning`/`critical`). Helps admins identify problematic addresses causing delivery issues.

### Email Scheduling

Emails can be scheduled for future delivery. Stored in the `scheduled_emails` table with sender, recipients, content, and `scheduled_at` timestamp. The `scheduled-send` worker runs every minute, picks up pending emails, and sends them via local Postfix (port 25). Users can list and cancel scheduled emails via `GET/DELETE /api/webmail/scheduled`.

### Labels/Tags (IMAP Keywords)

`POST /api/webmail/label` adds or removes IMAP keyword flags on messages. Labels are stored as IMAP flags with `$label_` prefix. Supports bulk operations on multiple UIDs.

### Server-side Filter Rules

Per-mailbox filter rules stored in the `filter_rules` table. Conditions: `from`, `to`, `subject`, `any`. Match types: `contains`, `is`, `starts_with`. Actions: `move`, `delete`, `mark_read`, `forward`. Rules integrate with Dovecot Sieve script generation. Managed via client portal.

### 2FA (TOTP)

Two-factor authentication using TOTP (Time-based One-Time Password). Both `admins` and `client_users` tables have `totp_secret` and `totp_enabled` fields. Setup generates a secret + QR code (`otpauth` + `qrcode` npm packages). Endpoints: `POST /api/auth/totp/setup`, `/verify`, `/disable`, `GET /api/auth/totp/status`. Defined in `totp.routes.ts`.

### Conversation Threading

Frontend groups messages by cleaned subject (strips `Re:`/`Fwd:` prefixes). Thread count badge shown in the message list. Enabled by default, preference stored in `localStorage` (`wenmail-thread-view`).

### Auto-responder / Vacation Reply

Per-mailbox vacation auto-reply. Stored in the `auto_responders` table with subject, body, start/end dates. Managed via `GET/PUT /api/client-portal/auto-responder/:mailboxId`. Generates a Dovecot Sieve vacation script per mailbox. Dovecot is configured for per-user sieve scripts.

### Catch-all Email

Domain-level catch-all forwarding. The `catch_all_rules` table links a domain to a target mailbox. Emails to non-existent addresses at the domain are forwarded to the specified address. Managed via `GET/PUT /api/client-portal/catch-all/:domainId`.

### Email Forwarding Rules

Per-mailbox forwarding to external addresses. The `forwarding_rules` table supports a `keep_copy` option (forward + keep in mailbox). Generates Sieve redirect rules. Managed via `GET/POST/DELETE /api/client-portal/forwarding/:mailboxId`.

### Client Self-Service Portal Users

Client owners can create manager accounts for their organization via `POST /api/client-portal/users`. Only users with `role='owner'` can create new portal users. Listed via `GET /api/client-portal/users`.

### Sender Avatars

Colored circle with the sender's initial letter in the webmail message list. Uses a 10-color palette with consistent color per sender (hash-based). Implemented as `SenderAvatar` component.

### Keyboard Shortcuts (Webmail)

Keyboard shortcuts for common webmail actions: `c`=compose, `r`=reply, `a`=reply all, `f`=forward, `/`=focus search, `Delete`=trash, `e`=archive, `Esc`=close message.

### Print Email

Printer icon in the message detail toolbar. Opens a formatted print preview in a new window with proper styling for printing.

### Email Client Setup Instructions

When a new mailbox is created, a welcome email is automatically sent to the new address with IMAP/SMTP
setup instructions (`backend/src/mail/welcome.ts`). The portal mailboxes page also shows setup instructions
with copy buttons once mailboxes exist. Settings are fetched dynamically from `/api/client-portal/mail-settings`
(which reads `platform_settings`):
- **IMAP**: `server.hostname`, port 993, SSL/TLS
- **SMTP**: `server.hostname`, port 587, STARTTLS
- **Username**: full email address
- **Webmail**: `server.webmail_url` (browser access)

---

## Data Flow Diagrams

### API Request Flow

```
Browser -> Nginx (80/443)
  server_name: wenvia.global (landing + admin)
    -> /                     -> Frontend (8080) -> Landing page
    -> /admin/*              -> Frontend (8080) -> Admin SPA
    -> /api/auth/*           -> Backend (3000) -> Admin auth
    -> /api/*                -> Backend (3000) -> Admin routes -> PostgreSQL

  server_name: wpanel.wenvia.global (client portal)
    -> /portal/*             -> Frontend (8080) -> Client Portal SPA
    -> /api/client-portal/*  -> Backend (3000) -> Client auth + scoped data

  server_name: mail.wenvia.global (webmail)
    -> /*                    -> Roundcube (9000) -> Dovecot (IMAP)
    -> /setup-help.html      -> Nginx -> static setup guide page
```

### Mail Flow (Incoming)

```
Internet -> Port 25 -> Postfix
  -> Rspamd (spam check + DKIM verify)
  -> Postfix queries PostgreSQL: domain exists? mailbox exists?
  -> Deliver to /var/mail/vhosts/{domain}/{user}/new/
  -> Dovecot serves via IMAP (port 993)
```

### Mail Flow (Outgoing)

```
User (Roundcube/Thunderbird) -> Port 587 (STARTTLS) -> Postfix
  -> Dovecot SASL auth (queries PostgreSQL)
  -> Rspamd signs with DKIM
  -> Postfix delivers to recipient's MX server
```

### Client Onboarding Flow

```
Admin creates client + plan -> Admin creates client_user (portal login)
  -> Client logs into portal -> Sees "Getting Started" guide
  -> Client adds domain -> DKIM keypair auto-generated
  -> Client views DNS guide (personalized with server hostname/IP)
  -> Client configures DNS at their registrar
  -> Client triggers verification -> DNS checked live
  -> Domain goes active -> Client creates mailboxes
  -> Welcome email auto-sent to each new mailbox with IMAP/SMTP setup
```

### Worker Flow

```
Scheduled/On-demand trigger -> Job enqueued -> Redis
  -> BullMQ Worker picks up job
  -> dns-check: queries DNS for all domains, updates status flags
  -> quota-sync: scans /var/mail/vhosts, updates storage_used_mb
  -> log-cleanup: purges mail_logs older than 90 days
  -> domain-setup: generates DKIM, verifies DNS, updates domain status
```

---

## How Postfix/Dovecot Connect to PostgreSQL

Postfix and Dovecot bypass the API entirely — they query the database directly.
This is the critical bridge between your app and the mail server.

### Postfix SQL Maps

```
# /etc/postfix/sql/virtual_domains.cf
user = mailplatform
password = <db_password>
hosts = 127.0.0.1
dbname = emailplatform
query = SELECT domain_name FROM domains
        WHERE domain_name='%s' AND status='active' AND verified=true

# /etc/postfix/sql/virtual_mailbox.cf
query = SELECT CONCAT(d.domain_name, '/', m.local_part, '/')
        FROM mailboxes m JOIN domains d ON m.domain_id = d.id
        WHERE m.local_part='%u' AND d.domain_name='%d' AND m.status='active'

# /etc/postfix/sql/virtual_alias.cf
query = SELECT destination FROM aliases a
        JOIN domains d ON a.domain_id = d.id
        WHERE a.source_local='%u' AND d.domain_name='%d' AND a.status='active'
```

### Dovecot SQL Auth

```
# /etc/dovecot/dovecot-sql.conf
driver = pgsql
connect = host=127.0.0.1 dbname=emailplatform user=mailplatform password=<db_password>
default_pass_scheme = SHA512-CRYPT

password_query = SELECT CONCAT(m.local_part, '@', d.domain_name) AS user,
                        m.password_hash AS password
                 FROM mailboxes m JOIN domains d ON m.domain_id = d.id
                 WHERE m.local_part='%n' AND d.domain_name='%d' AND m.status='active'
                   AND d.verified=true AND d.dkim_configured=true AND d.spf_configured=true

user_query = SELECT CONCAT('/var/mail/vhosts/', d.domain_name, '/', m.local_part) AS home,
                    5000 AS uid, 5000 AS gid,
                    CONCAT('*:bytes=', m.quota_mb * 1048576) AS quota_rule
             FROM mailboxes m JOIN domains d ON m.domain_id = d.id
             WHERE m.local_part='%n' AND d.domain_name='%d' AND m.status='active'
                   AND d.verified=true AND d.dkim_configured=true AND d.spf_configured=true

iterate_query = SELECT CONCAT(m.local_part, '@', d.domain_name) AS user
                FROM mailboxes m JOIN domains d ON m.domain_id = d.id
                WHERE m.status='active'
```

---

## Security

### Authentication & Encryption
- All web traffic over TLS (Let's Encrypt, auto-renewed)
- SSL certs for three domains: wenvia.global, wpanel.wenvia.global, mail.wenvia.global
- Postfix and Dovecot use Let's Encrypt certs (not snakeoil)
- SMTP submission requires STARTTLS + auth (port 587)
- IMAP over TLS only (port 993)
- Admin passwords hashed with argon2
- Client portal passwords hashed with argon2
- Mailbox passwords hashed with SHA512-CRYPT (Dovecot-compatible)
- JWT access tokens (15min admin / 30min client) + refresh tokens (7 days)
- Dual auth system: admin JWT (type: admin) and client JWT (type: client with clientId)
- Suspended clients blocked at login and at the portal route guard

### Email Authentication (per domain)
- SPF — declares your VPS IP as authorized sender
- DKIM — 2048-bit RSA keypair auto-generated per domain, Rspamd signs outgoing mail
- DMARC — policy configured using platform's DMARC email from settings

### SMTP Relay (Brevo)
- Brevo SMTP relay configured as fallback for outbound delivery
- Credentials stored in /etc/postfix/sasl_passwd
- Currently commented out in main.cf (direct delivery active)

### Infrastructure Protection
- UFW firewall — only ports 25, 80, 443, 587, 993 open
- Fail2ban — blocks IPs after failed login attempts; ignoreip includes 172.22.22.0/24 (gateway) and 172.17.0.0/16 (Docker)
- Rate limiting — @fastify/rate-limit (100 req/min default, Redis-backed in production)
- Rspamd — spam scoring, greylisting (with allowlist for Gmail/Outlook/major providers), RBL/DNSBL checks (Spamhaus, Barracuda, SpamCop), virus scanning (ClamAV)
- Rspamd spam thresholds — reject >15, add to junk >6, greylist >4
- Rspamd per-user rate limiting — 3 messages/min, 100 messages/hr per sender
- Sieve spam filter — auto-moves messages flagged as spam to the Junk folder
- Postfix sender verification + HELO checks
- Custom blocklist (IP/email/domain) with Rspamd sync, managed via admin UI

### Domain Verification Enforcement
- Dovecot SQL auth requires domain.verified=true AND dkim_configured=true AND spf_configured=true
- Unverified or partially configured domains cannot authenticate for IMAP at all
- Webmail login returns a specific error message explaining the domain is not yet verified

### Multi-Tenant Isolation
- Every portal query scoped by clientId from JWT
- Client cannot access other clients' domains, mailboxes, aliases, or logs
- Plan limits enforced on create (domains, mailboxes, aliases)
- Admin overrides per client without changing shared plan

### Audit
- Every admin action logged (who, what, when, from where)
- Mail logs tracked (delivery status, bounces, rejections)

---

## Migration & Import/Export

### Import (client moves TO your system)

**CSV Bulk Import**: Upload a CSV file to create mailboxes in bulk.
- `POST /api/client-portal/import/csv` — parse and create mailboxes from CSV
- `GET /api/client-portal/import/csv-template` — download CSV template

**IMAP Sync Migration**: Migrate mail from another server using imapsync.
- `POST /api/client-portal/import/imap` — triggers server-side imapsync
- Generates notifications on completion (success) or failure (error)

```bash
imapsync --host1 old.server.com --user1 user@client.com \
         --host2 mail.yourplatform.com --user2 user@client.com
```

### Export (client moves AWAY)
- `GET /api/client-portal/export/info` — export instructions and info
- IMAP access (they run imapsync from their end)
- Maildir tar export
- mbox conversion

---

## Deployment

```
Production VPS (Ubuntu 22.04+)
|
├── Host Services (systemd)
│   ├── Postfix
│   ├── Dovecot
│   ├── Rspamd + ClamAV
│   ├── Nginx
│   └── Certbot (timer)
|
├── Docker Compose
│   ├── postgres:16-alpine
│   ├── redis:7-alpine
│   ├── backend (custom image)
│   ├── frontend (nginx + static build)
│   └── roundcube (with roundcube-custom/ branding mounted)
|
└── Mail Storage
    └── /var/mail/vhosts/ (mounted volume)
```

### Port Map

| Port  | Service          | Public? |
|-------|-----------------|---------|
| 25    | Postfix SMTP    | Yes     |
| 80    | Nginx -> 443    | Yes     |
| 443   | Nginx HTTPS     | Yes     |
| 587   | Postfix Submit  | Yes     |
| 993   | Dovecot IMAPS   | Yes     |
| 3000  | Backend API     | No      |
| 5432  | PostgreSQL      | No      |
| 6379  | Redis           | No      |
| 8080  | Frontend        | No      |
| 9000  | Roundcube       | No      |

---

## Scaling Path

```
Phase 1 (now):     Single VPS — 30-50 clients, 5K mailboxes
Phase 2 (growth):  Managed PostgreSQL (separate), block storage volume
Phase 3 (scale):   Multiple VPS behind DNS round-robin / load balancer
Phase 4 (big):     Dedicated outbound IPs, failover MX, object storage for attachments
```

### VPS Requirements

| Scale     | CPU | RAM  | Storage | Bandwidth |
|-----------|-----|------|---------|-----------|
| 30-50     | 2   | 4GB  | 100GB   | 2TB/mo    |
| 50-200    | 4   | 8GB  | 500GB   | 5TB/mo    |
| 200+      | 8   | 16GB | 1TB+    | 10TB+/mo  |
