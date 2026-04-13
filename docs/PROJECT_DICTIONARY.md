# Project Dictionary — WenMail

> Quick-reference for every module, service, and component in the system.
> Use `Ctrl+F` or grep to find any module instantly.

---

## How to Read This

```
[Module Name]
  Location:    where the code/config lives
  Type:        backend | frontend | infra | database | config
  Depends On:  what it needs to run
  Used By:     what depends on it
  Description: what it does in one line
```

---

## Architecture Overview

Modular monolith. The backend is a single Fastify process that also runs
BullMQ workers in-process. Postfix, Dovecot, and Rspamd run on the host
(not in Docker). PostgreSQL, Redis, the backend, frontend, and Roundcube
run as Docker Compose services.

Two separate UIs: **Admin Dashboard** (platform operator) and
**Client Portal** (self-service for tenant companies). Each has its own
JWT auth flow, route guard, layout, and sidebar.

**Tech Stack:**
- Backend: Node.js 22 + Fastify 5 + TypeScript + Drizzle ORM + Zod
- Database: PostgreSQL 16 + Redis 7 (ioredis)
- Workers: BullMQ (in-process, same Node.js instance)
- Frontend: React 19 + Vite 6 + TailwindCSS 4 + TanStack Query + ky + Tiptap (rich text)
- Mail: Postfix + Dovecot + Rspamd (on host, not Docker)

---

## Infrastructure Services

### Postfix
```
Location:    /etc/postfix/ (host)
Type:        infra (mail)
Depends On:  PostgreSQL (SQL virtual maps), Rspamd (milter)
Used By:     Dovecot (SASL auth), Internet (port 25, 587)
Description: SMTP server — sends and receives all emails
Key Files:
  main.cf                    -> core config (domains, TLS, auth)
  master.cf                  -> service definitions
  sql/virtual_domains.cf     -> query: which domains we handle
  sql/virtual_mailbox.cf     -> query: which mailboxes exist
  sql/virtual_alias.cf       -> query: alias forwarding rules
```

### Dovecot
```
Location:    /etc/dovecot/ (host)
Type:        infra (mail)
Depends On:  PostgreSQL (SQL user auth), Mail Storage
Used By:     Roundcube, IMAP clients (Thunderbird, Outlook), Postfix (SASL)
Description: IMAP/POP3 server — users read their emails through this
Key Files:
  dovecot.conf               -> main config
  dovecot-sql.conf           -> DB queries for user auth + mailbox paths
  conf.d/10-auth.conf        -> authentication mechanisms
  conf.d/10-mail.conf        -> mail storage location (Maildir)
  conf.d/10-ssl.conf         -> TLS certificates
  conf.d/20-imap.conf        -> IMAP protocol settings (mail_max_userip_connections = 50)
  conf.d/90-quota.conf       -> per-user storage quotas
Domain Verification Enforcement:
  SQL auth query requires d.verified=true AND d.dkim_configured=true AND d.spf_configured=true
  Unverified domains cannot authenticate for IMAP at all
  Webmail login returns a specific error explaining the domain is not verified
Sieve Spam Filter:
  Global Sieve script auto-moves messages with spam headers (X-Spam-Flag: YES) to the Junk folder
Per-User Sieve Scripts:
  Dovecot configured for per-user sieve scripts (vacation auto-reply, forwarding rules, filter rules)
```

### Rspamd
```
Location:    /etc/rspamd/ (host)
Type:        infra (security)
Depends On:  Redis (for stats/bayes)
Used By:     Postfix (milter), Admin UI (abuse monitor, ban management)
Description: Spam filter — scores incoming emails, rejects spam, per-user rate limiting
Key Files:
  local.d/worker-proxy.inc       -> Postfix integration
  local.d/classifier-bayes.conf  -> learning spam/ham
  local.d/dkim_signing.conf      -> DKIM signing rules
  local.d/greylist.conf          -> greylisting config (allowlist: Gmail, Outlook, Yahoo, etc.)
  local.d/rbl.conf               -> RBL/DNSBL checks (Spamhaus, Barracuda, SpamCop)
  local.d/actions.conf           -> spam score thresholds: reject >15, add_header (junk) >6, greylist >4
  local.d/ratelimit.conf         -> per-sender rate limits: 3/min, 100/hr
Anti-Spam Stack:
  - Greylisting with allowlist for major providers (Gmail, Outlook, Yahoo, etc.)
  - RBL/DNSBL checks: Spamhaus, Barracuda, SpamCop
  - Spam score thresholds: reject >15, add to junk >6, greylist >4
  - Per-user rate limiting: 3 messages/min, 100 messages/hr per sender
  - Postfix sender verification + HELO checks
  - Custom blocklist sync from admin UI
  - Sieve spam filter: global script auto-moves spam-flagged messages to Junk folder
```

### Fail2ban
```
Location:    /etc/fail2ban/ (host)
Type:        infra (security)
Depends On:  Postfix logs, Dovecot logs, Nginx logs
Used By:     Admin UI (ban management page)
Description: Brute-force protection — bans IPs after repeated failed auth
Config:
  ignoreip includes 172.22.22.0/24 (gateway) and 172.17.0.0/16 (Docker)
  Jails: sshd, postfix, dovecot, nginx-http-auth
```

---

## Database

### PostgreSQL
```
Location:    Docker container (postgres:16-alpine) / port 5432
Type:        database
Depends On:  nothing
Used By:     Backend API, Postfix (SQL maps), Dovecot (SQL auth)
Description: Primary data store — all clients, domains, mailboxes, logs, billing, settings
Database:    emailplatform
User:        mailplatform
ORM:         Drizzle ORM (postgres-js driver, pool = 50 connections)
Config:      max_connections = 300
```

#### Tables Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `admins` | Platform admin accounts | id (uuid), email, password_hash, role, totp_secret, totp_enabled |
| `plans` | Subscription limits | id (uuid), name, max_domains, max_mailboxes, max_aliases, storage_per_mailbox_mb, max_send_per_day, price_monthly |
| `clients` | Client companies (tenants) | id (uuid), name, slug, contact_email, contact_phone, plan_id (FK), status, billing_status, trial_ends_at, service_enabled_at, service_disabled_at, max_mailbox_override, max_domain_override |
| `client_users` | Client portal login accounts | id (uuid), client_id (FK cascade), email, password_hash, name, role ('owner'/'manager'), status, last_login_at, totp_secret, totp_enabled |
| `domains` | Client email domains | id (uuid), client_id (FK cascade), domain_name, verification_token, verified, mx/spf/dkim/dmarc_configured, dkim_private_key, dkim_public_key, dkim_selector, status, verified_at |
| `mailboxes` | Real email accounts | id (uuid), domain_id (FK cascade), client_id (FK cascade), local_part, password_hash, display_name, quota_mb, storage_used_mb, status, last_login_at |
| `aliases` | Email forwarding rules | id (uuid), domain_id (FK cascade), client_id (FK cascade), source_local, destination, status |
| `invoices` | Billing invoices | id (uuid), client_id (FK cascade), invoice_number, amount, currency, status ('pending'/'paid'/'overdue'/'cancelled'), period_start, period_end, due_date, paid_at, notes |
| `payments` | Payment records | id (uuid), invoice_id (FK), client_id (FK), amount, method ('bank_transfer'/'card'/'upi'/'manual'), transaction_ref, status ('completed'/'refunded'/'failed'), notes, paid_at |
| `mail_logs` | Send/receive activity | id (bigserial), domain_id, mailbox_id, direction, from_address, to_address, subject, message_id, status, size_bytes, postfix_queue_id, error_message |
| `dns_checks` | DNS verification history | id (bigserial), domain_id (FK), check_type, status, raw_result, checked_at |
| `platform_settings` | Key-value config store | key (PK, varchar 100), value (text), label, group ('server'/'mail'/'branding'/'relay'), updated_at |
| `audit_log` | Admin action history | id (bigserial), actor_type, actor_id, action, target_type, target_id, details (JSONB), ip_address (inet) |
| `password_reset_requests` | DB-based password reset (no email) | id (uuid), client_user_id (FK), client_id (FK), mailbox_id (FK, nullable), email, request_type ('portal'/'mailbox'), status ('pending'/'completed'/'rejected'), resolved_by (FK admins), resolved_at, notes, created_at |
| `blocklist` | Custom bans (IP/email/domain) | id (uuid), type ('ip'/'email'/'domain'), value, reason, permanent, expires_at, created_by (FK admins), created_at |
| `notifications` | Centralized notification system | id (uuid), target_type ('admin'/'client'), target_id (uuid, nullable), type, title, message, action_url, severity ('info'/'warning'/'error'/'success'), read, dismissed, metadata (JSONB), created_at |
| `scheduled_emails` | Deferred email sending | id (bigserial), sender, to, cc, bcc, subject, text, html, attachments_json (JSONB), scheduled_at, status ('pending'/'sent'/'failed'), sent_at, error |
| `filter_rules` | Server-side mail filtering | id (uuid), mailbox_id (FK cascade), name, condition ('from'/'to'/'subject'/'any'), match_type ('contains'/'is'/'starts_with'), match_value, action ('move'/'delete'/'mark_read'/'forward'), action_value, enabled, priority |
| `auto_responders` | Vacation auto-reply | id (uuid), mailbox_id (FK cascade), enabled, subject, body, start_date, end_date |
| `catch_all_rules` | Domain catch-all forwarding | id (uuid), domain_id (FK cascade), client_id (FK cascade), enabled, forward_to |
| `forwarding_rules` | Per-mailbox email forwarding | id (uuid), mailbox_id (FK cascade), client_id (FK cascade), forward_to, keep_copy, enabled |

#### Unique Constraints

| Table | Constraint |
|-------|-----------|
| `admins` | email (unique) |
| `clients` | slug (unique) |
| `client_users` | email (unique) |
| `domains` | domain_name (unique) |
| `invoices` | invoice_number (unique) |
| `mailboxes` | (domain_id, local_part) composite unique index |
| `aliases` | (domain_id, source_local) composite unique index |

### Redis
```
Location:    Docker container (redis:7-alpine) / port 6379
Type:        database (cache)
Depends On:  nothing
Used By:     Backend API (rate limiting, BullMQ), Rspamd (stats/bayes)
Description: Rate limiting, job queues, spam filter stats
Client:      ioredis (two connections: main + subscriber, maxRetriesPerRequest=null for BullMQ)
Key Namespaces:
  ratelimit:*        -> @fastify/rate-limit counters
  bull:*             -> BullMQ job queue data
  rspamd:*           -> spam filter bayes/stats (host Rspamd)
  imap:session:*     -> IMAP connection pool sessions (persistent connections, max 2 per mailbox)
  webmail:contacts:* -> per-user contacts (sorted sets, max 200 per user)
```

---

## Backend API

### Entry Point
```
Location:    backend/src/server.ts
Type:        backend
Description: Starts the Fastify server and workers
```

### App Setup
```
Location:    backend/src/app.ts
Type:        backend
Depends On:  all route modules, config, plugins
Description: Builds the Fastify instance — registers CORS, JWT, rate limiting, error handler, routes
Plugins:
  @fastify/cors          -> origin control (dev: all, prod: PLATFORM_DOMAIN only)
  @fastify/jwt           -> JWT sign/verify (secret from env.JWT_SECRET)
  @fastify/rate-limit    -> 100 req/min, Redis-backed in production
Error Handling:
  ZodError               -> 400 with flattened field errors
  AppError               -> custom status code + error code
  Other                  -> 500 Internal Server Error
Health Check:
  GET /api/health        -> { status: "ok", timestamp }
Route Registration:
  Admin routes:
    /api/auth             -> authRoutes
    /api/clients          -> clientRoutes
    /api                  -> domainRoutes (sub-paths)
    /api                  -> mailboxRoutes (sub-paths)
    /api                  -> aliasRoutes (sub-paths)
    /api/plans            -> planRoutes
    /api/logs             -> logRoutes
    /api/dashboard        -> dashboardRoutes
    /api/admin            -> billingRoutes
    /api/admin/server     -> serverHealthRoutes
    /api/admin/abuse      -> abuseRoutes
    /api/admin/bans       -> bansRoutes
    /api/admin/settings   -> settingsRoutes
    /api/admin/notifications -> notificationRoutes (admin)
  Client Portal routes:
    /api/client-portal/auth -> clientAuthRoutes
    /api/client-portal      -> portalRoutes
    /api/client-portal/notifications -> notificationRoutes (client)
    /api/client-portal/import -> importExportRoutes
    /api/client-portal/export -> importExportRoutes
```

### Module: auth
```
Location:    backend/src/modules/auth/
Type:        backend
Depends On:  PostgreSQL (admins table), @fastify/jwt
Used By:     Frontend admin (login), all admin API routes (auth guard)
Description: Admin authentication — login, JWT tokens, session management
Files:
  auth.routes.ts      -> POST /api/auth/login, POST /api/auth/refresh, GET /api/auth/me
  auth.service.ts     -> password verify (argon2), token generation
  auth.guard.ts       -> JWT verification preHandler hook for admin routes
Endpoints:
  POST   /api/auth/login     -> authenticate admin, return accessToken (15m) + refreshToken (7d)
  POST   /api/auth/refresh   -> exchange refreshToken for new accessToken
  GET    /api/auth/me         -> return current admin (requires auth)
```

### Module: clients
```
Location:    backend/src/modules/clients/
Type:        backend
Depends On:  PostgreSQL (clients, plans tables), auth guard
Used By:     Frontend (client management pages)
Description: CRUD for client companies — the tenants of the platform
Files:
  client.routes.ts    -> CRUD /api/clients (all routes behind authGuard)
  client.service.ts   -> business logic, plan limit enforcement, stats
  client.schema.ts    -> Zod schemas (createClientSchema, updateClientSchema)
Endpoints:
  GET    /api/clients              -> list all clients
  POST   /api/clients              -> create new client
  GET    /api/clients/:id          -> get client details + stats
  PUT    /api/clients/:id          -> update client info
  DELETE /api/clients/:id          -> deactivate client
```

### Module: domains
```
Location:    backend/src/modules/domains/
Type:        backend
Depends On:  PostgreSQL (domains table), node:dns (DNS resolution), config/env
Used By:     Frontend (domain management), Client Portal (domain self-service), Postfix (via DB)
Description: Domain lifecycle — add, verify DNS, generate DKIM, activate
Files:
  domain.routes.ts    -> CRUD + verify/dns-status (registered under /api prefix)
  domain.service.ts   -> domain creation, DKIM keypair generation, status management
  dns.service.ts      -> DNS record verification (MX, SPF, DKIM, DMARC, TXT ownership)
Endpoints:
  GET    /api/clients/:clientId/domains     -> list client's domains
  POST   /api/clients/:clientId/domains     -> add new domain (returns DNS setup instructions)
  POST   /api/domains/:id/verify            -> trigger DNS verification
  GET    /api/domains/:id/dns-status        -> check all DNS records
  DELETE /api/domains/:id                   -> remove domain
```

### Module: mailboxes
```
Location:    backend/src/modules/mailboxes/
Type:        backend
Depends On:  PostgreSQL (mailboxes table), mail integration layer
Used By:     Frontend (mailbox management)
Description: Create/manage email accounts — the actual inboxes
Files:
  mailbox.routes.ts   -> CRUD (registered under /api prefix)
  mailbox.service.ts  -> create mailbox, enforce quotas & plan limits
Endpoints:
  GET    /api/domains/:domainId/mailboxes   -> list mailboxes for a domain
  POST   /api/domains/:domainId/mailboxes   -> create mailbox
  GET    /api/mailboxes/:id                 -> get single mailbox
  PUT    /api/mailboxes/:id                 -> update password/quota/status/displayName
  DELETE /api/mailboxes/:id                 -> delete mailbox
```

### Module: aliases
```
Location:    backend/src/modules/aliases/
Type:        backend
Depends On:  PostgreSQL (aliases table)
Used By:     Frontend (alias management)
Description: Email forwarding — route emails without a real inbox
Files:
  alias.routes.ts     -> CRUD (registered under /api prefix)
  alias.service.ts    -> create/delete aliases, validate destinations
Endpoints:
  GET    /api/domains/:domainId/aliases     -> list aliases for a domain
  POST   /api/domains/:domainId/aliases     -> create alias
  DELETE /api/aliases/:id                   -> remove alias
```

### Module: plans
```
Location:    backend/src/modules/plans/
Type:        backend
Depends On:  PostgreSQL (plans table)
Used By:     Frontend (plan management), clients module (limit checks)
Description: Subscription plans — define limits per client tier
Files:
  plan.routes.ts      -> CRUD /api/plans
  plan.service.ts     -> plan management
Endpoints:
  GET    /api/plans              -> list all plans
  GET    /api/plans/:id          -> get single plan
  POST   /api/plans              -> create plan
  PUT    /api/plans/:id          -> update plan (partial)
  DELETE /api/plans/:id          -> delete plan
```

### Module: logs
```
Location:    backend/src/modules/logs/
Type:        backend
Depends On:  PostgreSQL (mail_logs, audit_log tables)
Used By:     Frontend (log viewer pages)
Description: Read-only access to mail activity and admin audit trails
Files:
  log.routes.ts       -> GET /api/logs/mail, GET /api/logs/audit
  log.service.ts      -> filtered queries with pagination
Endpoints:
  GET    /api/logs/mail    -> mail logs (filters: domainId, status, from, to, page, limit)
  GET    /api/logs/audit   -> audit logs (filters: page, limit)
```

### Module: dashboard
```
Location:    backend/src/modules/dashboard/
Type:        backend
Depends On:  PostgreSQL (aggregate queries across clients, domains, mailboxes, aliases, mail_logs)
Used By:     Frontend (dashboard page)
Description: Aggregate stats — total clients, domains, mailboxes, aliases, recent activity
Files:
  dashboard.routes.ts -> GET /api/dashboard/stats
Endpoints:
  GET    /api/dashboard/stats   -> { clients, domains, mailboxes, aliases, recentActivity[] }
```

### Module: billing (Admin)
```
Location:    backend/src/modules/billing/
Type:        backend
Depends On:  PostgreSQL (clients, client_users, invoices, payments tables), auth guard, nanoid
Used By:     Frontend admin (billing page, client controls)
Description: Admin billing — client controls, invoices CRUD, payment recording, client user management, billing overview
Files:
  billing.routes.ts   -> all admin billing endpoints (registered under /api/admin prefix)
Endpoints:
  PUT    /api/admin/clients/:id/controls   -> service toggle (status), billing status, limit overrides (maxMailboxOverride, maxDomainOverride)
  GET    /api/admin/clients/:id/billing    -> client billing summary (invoices, payments, totals)
  GET    /api/admin/clients/:id/users      -> list client portal users for a client
  POST   /api/admin/client-users           -> create client portal user (email, password, name, role)
  GET    /api/admin/invoices               -> list all invoices (paginated, joined with client name)
  POST   /api/admin/invoices               -> create invoice (clientId, amount, currency, periodStart, periodEnd, dueDate, notes)
  PUT    /api/admin/invoices/:id/status    -> update invoice status (pending/paid/overdue/cancelled)
  POST   /api/admin/payments               -> record payment (invoiceId, amount, method, transactionRef; auto-marks invoice paid if full amount)
  GET    /api/admin/billing/overview       -> platform-wide stats (totalRevenue, pendingAmount, pendingCount, overdueCount)
```

### Module: server-health
```
Location:    backend/src/modules/server-health/
Type:        backend
Depends On:  PostgreSQL, Redis, child_process (systemctl, postqueue, df), node:os, auth guard
Used By:     Frontend admin (server health page)
Description: System monitoring — OS info, DB health, Redis health, mail service status, disk usage
Files:
  health.routes.ts    -> server health endpoints (registered under /api/admin/server prefix)
Endpoints:
  GET    /api/admin/server/health   -> full system overview { system, database, redis, mail, disk, timestamp }
  GET    /api/admin/server/metrics  -> lightweight polling { cpu (loadAvg, cores), memory (totalMb, usedMb, freePercent), process (heapMb, rssMb, uptime) }
Health Checks:
  system     -> hostname, platform, arch, nodeVersion, uptime, CPU model/cores/loadAvg, memory (total/used/free GB + %)
  database   -> pg ping latency, pg_database_size, active connections count
  redis      -> ping latency, used_memory_human, peak_memory, total keys
  mail       -> systemctl is-active for postfix, dovecot, rspamd; postqueue mail queue count
  disk       -> df -h for / and /var/mail
  rspamd     -> spam/ham stats, action breakdown
  fail2ban   -> jail status, banned IP count per jail
  ssl        -> certificate expiry date per domain
  imap       -> active Dovecot IMAP connection count
```

### Module: abuse
```
Location:    backend/src/modules/abuse/
Type:        backend
Depends On:  Rspamd (HTTP API), PostgreSQL (mail_logs), auth guard
Used By:     Frontend admin (abuse monitor page at /admin/abuse)
Description: Abuse monitoring — Rspamd stats, high volume senders, bounce tracking, outbound by client, auto-refresh alerts
Files:
  abuse.routes.ts    -> abuse monitoring endpoints (registered under /api/admin/abuse prefix)
Endpoints:
  GET    /api/admin/abuse/overview              -> Rspamd stats, high volume senders, bounce rates, outbound by client
  GET    /api/admin/abuse/alerts                -> active abuse alerts with auto-refresh
  GET    /api/admin/abuse/abnormal-recipients   -> recipients with high bounce rates (last 7d): toAddress, total, bounced, bounceRate %, severity
```

### Module: bans
```
Location:    backend/src/modules/bans/
Type:        backend
Depends On:  Fail2ban (CLI), PostgreSQL (blocklist table), Rspamd (blocklist sync), auth guard
Used By:     Frontend admin (ban management page at /admin/bans)
Description: Ban management — Fail2ban IP view/ban/unban, custom blocklist (email/domain/IP) with Rspamd sync, all actions audit logged
Files:
  bans.routes.ts     -> ban management endpoints (registered under /api/admin/bans prefix)
Endpoints:
  GET    /api/admin/bans/fail2ban         -> list banned IPs from Fail2ban
  POST   /api/admin/bans/fail2ban         -> manually ban an IP via Fail2ban
  POST   /api/admin/bans/fail2ban/unban   -> unban an IP from Fail2ban
  GET    /api/admin/bans/blocklist        -> list custom blocklist entries
  POST   /api/admin/bans/blocklist        -> add blocklist entry (type: ip/email/domain, value, reason, permanent, expires_at)
  DELETE /api/admin/bans/blocklist        -> remove blocklist entry
```

### Module: settings
```
Location:    backend/src/modules/settings/
Type:        backend
Depends On:  PostgreSQL (platform_settings table), auth guard
Used By:     Frontend admin (settings page), portal DNS guide (buildDnsInstructions),
             domain.routes (domain creation returns DNS instructions),
             dns.service (MX/SPF checks use hostname + IP from settings)
Description: Platform-wide key-value config store with defaults, hints, and DNS instruction builder
Files:
  settings.routes.ts   -> GET/PUT /api/admin/settings (registered under /api/admin/settings prefix)
  settings.service.ts  -> getSetting(), getAllSettings(), updateSettings(), buildDnsInstructions()
Endpoints:
  GET    /api/admin/settings      -> all settings (defaults overlaid with DB values, grouped by server/mail/branding, includes hints)
  PUT    /api/admin/settings      -> upsert settings (body: Record<string, string>)
Default Settings (each with hint text for admin guidance):
  server.hostname            -> "mail.yourplatform.com"   (group: server)  hint: MX target hostname
  server.ip                  -> ""                        (group: server)  hint: VPS public IP for SPF
  server.webmail_url         -> ""                        (group: server)  hint: Roundcube URL
  mail.postmaster_email      -> "postmaster@..."          (group: mail)    hint: bounce notifications
  mail.dmarc_email           -> "dmarc@..."               (group: mail)    hint: DMARC reports
  mail.max_attachment_mb     -> "25"                      (group: mail)    hint: attachment limit
  branding.platform_name     -> "WenMail"                 (group: branding) hint: shown in portal
  branding.support_email     -> "support@..."             (group: branding) hint: support contact
  relay.mode                 -> "direct"                  (group: relay)    hint: direct or relay delivery
  relay.host                 -> ""                        (group: relay)    hint: SMTP relay hostname
  relay.port                 -> ""                        (group: relay)    hint: SMTP relay port
  relay.username             -> ""                        (group: relay)    hint: SMTP relay username
  relay.password             -> ""                        (group: relay)    hint: SMTP relay password
Functions:
  buildDnsInstructions(domain) -> returns step-by-step DNS records using live settings (hostname, IP, DMARC email)
                                  Used by: domain creation route, admin dns-guide endpoint, portal dns-guide endpoint
```

### Module: notifications
```
Location:    backend/src/modules/notifications/ (admin), backend/src/modules/client-portal/notification.routes.ts (client)
Type:        backend
Depends On:  PostgreSQL (notifications table), auth guards
Used By:     Frontend admin (notification bell), Client Portal (notification bell)
Description: Centralized notification system — CRUD for notifications with read/dismiss state
Files:
  notification.routes.ts (admin)   -> admin notification endpoints
  notification.routes.ts (portal)  -> client notification endpoints
Endpoints (identical pattern for admin and client):
  GET    /api/admin/notifications              -> list admin notifications (target_type='admin')
  GET    /api/admin/notifications/unread-count -> unread count
  PUT    /api/admin/notifications/:id/read     -> mark as read
  PUT    /api/admin/notifications/:id/dismiss  -> dismiss notification
  POST   /api/admin/notifications/mark-all-read -> mark all as read
  POST   /api/admin/notifications/clear-all    -> clear all dismissed/read
  (same pattern under /api/client-portal/notifications/*)
```

### Module: import-export
```
Location:    backend/src/modules/client-portal/import-export.routes.ts
Type:        backend
Depends On:  PostgreSQL (mailboxes, domains tables), imapsync (system binary), client auth guard, notify.ts
Used By:     Client Portal (import/export page)
Description: CSV bulk mailbox creation, IMAP migration via imapsync, export info
Files:
  import-export.routes.ts -> all import/export endpoints
Endpoints:
  POST   /api/client-portal/import/csv          -> CSV bulk mailbox creation
  GET    /api/client-portal/import/csv-template  -> download CSV template
  POST   /api/client-portal/import/imap          -> IMAP sync migration (triggers imapsync)
  GET    /api/client-portal/export/info          -> export instructions and info
Notifications:
  Migration complete -> notifyClient() with severity='success'
  Migration failed   -> notifyClient() with severity='error'
```

### Module: client-portal/auth
```
Location:    backend/src/modules/client-portal/
Type:        backend
Depends On:  PostgreSQL (client_users, clients tables), @fastify/jwt
Used By:     Client Portal frontend (login), all portal routes (client auth guard)
Description: Client portal authentication — separate JWT flow with type="client"
Files:
  client-auth.guard.ts  -> JWT preHandler that verifies token has type="client"
  client-auth.routes.ts -> login, refresh, me, password change (registered under /api/client-portal/auth prefix)
Endpoints:
  POST   /api/client-portal/auth/login      -> authenticate client user, return accessToken (30m) + refreshToken (7d) + user info (incl. clientName)
  POST   /api/client-portal/auth/refresh    -> exchange refreshToken (type="client-refresh") for new accessToken
  GET    /api/client-portal/auth/me          -> return current client user + client info (name, slug, status, billingStatus)
  PUT    /api/client-portal/auth/password    -> change password (requires currentPassword + newPassword)
  POST   /api/client-portal/auth/forgot-password -> submit password reset request (public, no auth — creates pending record for admin)
Guard Checks:
  - Token must have type="client"
  - User status must be "active"
  - Client status must be "active" (suspended organizations cannot log in)
```

### Module: client-portal/portal
```
Location:    backend/src/modules/client-portal/
Type:        backend
Depends On:  PostgreSQL (clients, domains, mailboxes, aliases, mail_logs, invoices, payments, plans), client auth guard, dns.service, settings.service, password (Dovecot hash), mail integration (reload Postfix/Dovecot)
Used By:     Client Portal frontend (all portal pages)
Description: Full self-service API — clients manage their own domains, mailboxes, aliases, view logs and billing
Files:
  portal.routes.ts    -> all client portal endpoints (registered under /api/client-portal prefix)
Endpoints:
  GET    /api/client-portal/dashboard                    -> client stats (domain/mailbox/alias counts, plan info, effective limits with overrides)
  GET    /api/client-portal/domains                      -> list client's domains
  POST   /api/client-portal/domains                      -> add domain (validates plan limit, generates DKIM, returns DNS instructions)
  POST   /api/client-portal/domains/:id/verify           -> trigger DNS verification (checks all records, updates domain status)
  GET    /api/client-portal/domains/:id/dns-status       -> live DNS record check
  GET    /api/client-portal/domains/:id/dns-guide        -> personalized DNS setup instructions (uses platform settings for hostname/IP/DMARC)
  DELETE /api/client-portal/domains/:id                  -> soft-disable domain (sets status="disabled")
  GET    /api/client-portal/domains/:domainId/mailboxes  -> list mailboxes for a domain
  POST   /api/client-portal/domains/:domainId/mailboxes  -> create mailbox (plan limit check, Dovecot hash, reloads Postfix/Dovecot)
  PUT    /api/client-portal/mailboxes/:id                -> update mailbox (password, displayName, status)
  DELETE /api/client-portal/mailboxes/:id                -> soft-disable mailbox
  GET    /api/client-portal/domains/:domainId/aliases    -> list aliases for a domain
  POST   /api/client-portal/domains/:domainId/aliases    -> create alias (plan limit check, reloads Postfix)
  DELETE /api/client-portal/aliases/:id                  -> delete alias (hard delete, reloads Postfix)
  GET    /api/client-portal/logs                         -> client's mail logs (paginated, scoped to their domains)
  GET    /api/client-portal/billing                      -> client's invoices + payments
  GET    /api/client-portal/mail-settings                -> IMAP/SMTP/webmail settings (hostname, ports, security — from platform_settings)
  GET    /api/client-portal/migration/info               -> import/export instructions (IMAP sync, Maildir export, MBOX export)
  DELETE /api/client-portal/password-resets/:id          -> dismiss/reject a mailbox password reset request
```

### Module: client-portal/mail-features
```
Location:    backend/src/modules/client-portal/ (via mail-features.routes.ts)
Type:        backend
Depends On:  PostgreSQL (auto_responders, catch_all_rules, forwarding_rules, filter_rules), Dovecot Sieve, client auth guard
Used By:     Client Portal frontend (mailbox settings)
Description: Auto-responder, catch-all, forwarding rules, and filter rules — all generate Dovecot Sieve scripts
Endpoints:
  GET    /api/client-portal/auto-responder/:mailboxId   -> get auto-responder settings
  PUT    /api/client-portal/auto-responder/:mailboxId   -> update vacation reply (generates Sieve vacation script)
  GET    /api/client-portal/catch-all/:domainId         -> get catch-all rule
  PUT    /api/client-portal/catch-all/:domainId         -> update catch-all forwarding
  GET    /api/client-portal/forwarding/:mailboxId       -> get forwarding rules
  POST   /api/client-portal/forwarding/:mailboxId       -> add forwarding rule (generates Sieve redirect)
  DELETE /api/client-portal/forwarding/:mailboxId       -> remove forwarding rule
  GET    /api/client-portal/users                       -> list portal users
  POST   /api/client-portal/users                       -> create manager account (owner only)
Filter Rules (managed via client portal):
  Conditions: from, to, subject, any
  Match types: contains, is, starts_with
  Actions: move, delete, mark_read, forward
  Integrates with Sieve script generation
```

### Module: billing (Admin) — Password Resets
```
Location:    backend/src/modules/billing/
Description: Three reset flows — mail user->client (mailbox type), client->admin (portal type), password change modal
Endpoints (additional, registered alongside billing routes):
  GET    /api/admin/password-resets        -> list all password reset requests (admin sees portal type only)
  PUT    /api/admin/password-resets/:id    -> resolve a request (admin sets new password, marks completed/rejected)
  DELETE /api/client-portal/password-resets/:id -> dismiss/reject a mailbox reset request (client portal)
Reset Flow:
  1. Mail user -> Client: mailbox user requests via webmail forgot-password (request_type='mailbox', mailbox_id set)
     Client receives notification in portal (no banner — notifications only)
  2. Client -> Admin: client user requests via portal forgot-password (request_type='portal')
     Admin resolves from password-resets page
  3. Password change modal: strength indicator, confirm field, eye toggle (replaces browser prompt)
Visibility:
  Admin sees only request_type='portal' requests
  Client sees only request_type='mailbox' requests
```

### Background Workers (BullMQ)
```
Location:    backend/src/workers/
Type:        backend (in-process workers)
Depends On:  Redis (BullMQ), PostgreSQL
Used By:     runs on schedule via BullMQ repeatable jobs
Description: Periodic tasks that run inside the same Node.js process
Files:
  index.ts                -> startWorkers() — creates all workers + registers schedules
  queues.ts               -> queue definitions (dns-check, quota-sync, log-cleanup, domain-setup, mail-log-sync, scheduled-send)
  dns-check.worker.ts     -> re-verify DNS records for all active domains (hourly, cron: 0 * * * *)
  quota-sync.worker.ts    -> sync mailbox storage usage from Dovecot (every 6h, cron: 0 */6 * * *)
  log-cleanup.worker.ts   -> delete old mail logs (daily at 3 AM, cron: 0 3 * * *)
  domain-setup.worker.ts  -> async domain provisioning (event-driven, dispatched on domain create)
  mail-log.worker.ts          -> parse Postfix syslog, write delivery records to mail_logs table (every 5 min)
  scheduled-send.worker.ts   -> send pending scheduled emails via local Postfix port 25 (every minute)
Queues:
  dns-check       -> repeatable (hourly)
  quota-sync      -> repeatable (every 6 hours)
  log-cleanup     -> repeatable (daily at 3 AM)
  domain-setup    -> on-demand (triggered when a domain is created)
  mail-log-sync   -> repeatable (every 5 minutes)
  scheduled-send  -> repeatable (every minute)
```

### Mail Integration Layer
```
Location:    backend/src/mail/
Type:        backend (system bridge)
Depends On:  shell access to Postfix/Dovecot (via child_process.exec)
Used By:     mailbox service, domain service, portal routes, workers
Description: Bridge between the API and the host mail server processes
Files:
  postfix.ts      -> reloadPostfix() — runs `postfix reload` (no-op in dev)
                  -> reloadDovecot() — runs `doveadm reload` (no-op in dev)
  dovecot.ts      -> recalcQuota(email) — runs `doveadm quota recalc`
                  -> kickUser(email) — runs `doveadm kick` (disconnect sessions)
                  -> getMailboxStats(email) — runs `doveadm mailbox status`
  welcome.ts      -> sendWelcomeEmail(to, displayName, domain) — sends setup instructions (IMAP/SMTP config)
                     to newly created mailboxes via local Postfix
```

### Module: webmail
```
Location:    backend/src/modules/webmail/
Type:        backend
Description: Custom webmail endpoints — folder management, password change, contacts, templates, scheduling, labels
IMAP Connection Pooling:
  - Persistent IMAP connections per session (max 2 per mailbox)
  - Redis-backed sessions for connection state
  - 13-83x faster than per-request connections
Files:
  webmail.routes.ts        -> IMAP endpoints (folders, messages, compose, search)
  contacts.ts              -> contact management (Redis sorted set, auto-record recipients)
  templates.ts             -> pre-built email templates (EmailTemplate interface, 6 templates)
  totp.routes.ts           -> 2FA TOTP endpoints (setup, verify, disable, status)
  mail-features.routes.ts  -> labels, filter rules, auto-responder, catch-all, forwarding
Endpoints:
  POST   /api/webmail/ensure-folder       -> ensure an IMAP folder exists (creates if missing)
  POST   /api/webmail/change-password     -> change mailbox password from webmail
  GET    /api/webmail/contacts?q=search   -> search contacts (Redis sorted set)
  POST   /api/webmail/contacts            -> add contact manually
  DELETE /api/webmail/contacts            -> remove contact
  GET    /api/webmail/templates           -> list pre-built email templates
  POST   /api/webmail/schedule            -> store email with scheduled time
  GET    /api/webmail/scheduled           -> list user's scheduled emails
  DELETE /api/webmail/scheduled/:id       -> cancel scheduled email
  POST   /api/webmail/label               -> add/remove IMAP keywords ($label_ prefix, bulk UIDs)
  POST   /api/auth/totp/setup             -> generate TOTP secret + QR code (otpauth + qrcode)
  POST   /api/auth/totp/verify            -> validate 6-digit code, enable 2FA
  POST   /api/auth/totp/disable           -> disable 2FA
  GET    /api/auth/totp/status            -> check if 2FA enabled
Contacts:
  - Redis key: webmail:contacts:{email} (sorted set, max 200 per user)
  - Auto-records recipients when sending emails
  - Frontend: contacts.tsx page with avatars, search, compose-to
Templates:
  - 6 templates: Welcome, Meeting Request, Invoice Reminder, Follow-up, Thank You, Announcement
  - Each has: id, name, category, subject, html, text
  - Uses [placeholder] variables for customization
Compose Window:
  - Rich text editor (Tiptap) — bold, italic, underline, bullet/ordered lists, links, blockquotes, undo/redo
  - Three-state window: minimize / default / expanded (95vw x 92vh)
  - Gmail-style email chips for To/CC/BCC — type+Enter to add, X to remove, double-click to edit, paste multiple
  - Drag-and-drop file attachments
  - New components: email-chips.tsx, rich-editor.tsx
Auth:
  - Login cooldown: 5 failed attempts = 15 min lock per email address
  - Forgot password: mail user requests reset, client gets notification in portal
  - 2FA (TOTP): optional two-factor via otpauth + qrcode npm packages
Webmail Settings (4 tabs):
  1. General   -> display name, page size
  2. Compose   -> signature editor
  3. Account   -> change password (strength indicator, confirm field, eye toggle modal)
  4. Mail Setup -> IMAP/SMTP connection info for external clients
Keyboard Shortcuts:
  c=compose, r=reply, a=replyAll, f=forward, /=search, Delete=trash, e=archive, Esc=close
Conversation Threading:
  - Groups messages by cleaned subject (strips Re:/Fwd:)
  - Thread count badge in message list
  - Stored in localStorage (wenmail-thread-view)
Sender Avatars:
  - SenderAvatar component: colored circle with initial letter
  - 10-color palette, consistent color per sender (hash-based)
Print Email:
  - Printer icon in message detail toolbar
  - Opens formatted print preview in new window
```

### Seed Script
```
Location:    backend/src/seed.ts
Type:        backend (utility)
Depends On:  PostgreSQL (admins, plans, clients, client_users tables)
Description: Creates initial admin user, starter plans, and optionally a demo client + client user
Run:         npx tsx src/seed.ts
```

### Shared Libraries
```
Location:    backend/src/lib/
Type:        backend (shared)
Files:
  errors.ts       -> AppError, NotFoundError, ConflictError, ForbiddenError, LimitExceededError
  logger.ts       -> pino logger (debug in dev with pino-pretty, info in prod)
  password.ts     -> hashPassword / verifyPassword (argon2 for admin + client user auth)
                  -> hashPasswordForDovecot (SHA512-CRYPT format for mail accounts)
  redis.ts        -> ioredis client (redis) + subscriber connection (redisSubscriber)
  notify.ts       -> centralized notification service
                     notify(target_type, target_id, type, title, message, opts?) — create notification
                     notifyAdmin(type, title, message, opts?) — shortcut for admin notifications
                     notifyClient(clientId, type, title, message, opts?) — shortcut for client notifications
                     Auto-generated on: password resets, IMAP migration complete/fail
```

### Config
```
Location:    backend/src/config/
Type:        backend (config)
Files:
  env.ts          -> Zod-validated environment variables
Environment Variables:
  PORT             (number, default: 3000)
  HOST             (string, default: "0.0.0.0")
  NODE_ENV         ("development" | "production" | "test")
  DATABASE_URL     (string, required, postgres:// URL)
  REDIS_URL        (string, default: "redis://localhost:6379")
  JWT_SECRET       (string, min 32 chars)
  JWT_ACCESS_EXPIRES  (string, default: "15m")
  JWT_REFRESH_EXPIRES (string, default: "7d")
  PLATFORM_DOMAIN  (string, default: "mail.yourplatform.com")
```

### Database Config
```
Location:    backend/src/db/
Type:        backend (database)
Files:
  index.ts        -> Drizzle ORM instance (postgres-js driver, pool = 50 connections)
  schema.ts       -> all table definitions (21 tables) + relations
  migrations/
    0001_*.sql                 -> initial schema
    0002_fuzzy_chimera.sql     -> adds password_reset_requests table
```

### Build & Config Files
```
Location:    backend/
Files:
  package.json       -> dependencies, scripts (dev/build/start/db:generate/db:migrate/db:studio)
  tsconfig.json      -> TypeScript config
  drizzle.config.ts  -> Drizzle Kit config (migrations, studio)
  Dockerfile         -> production Docker image
  .env.example       -> environment variable template
```

---

## Frontend — Admin Dashboard

### Entry Point
```
Location:    frontend/src/main.tsx
Type:        frontend
Description: React root render, TanStack Query provider setup
```

### Router (App)
```
Location:    frontend/src/App.tsx
Type:        frontend
Description: React Router v7 routes — AdminProtected wrapper for admin, PortalProtected wrapper for portal
Public Routes:
  /                            -> LandingPage (product landing with features, pricing, 3-step guide)
Admin Routes (inside Layout, requires AdminProtected, all under /admin prefix):
  /admin/login                 -> LoginPage (public)
  /admin (index)               -> DashboardPage
  /admin/clients               -> ClientListPage
  /admin/clients/:id           -> ClientDetailPage
  /admin/clients/:id/controls  -> ClientControlsPage
  /admin/domains               -> DomainListPage
  /admin/domains/:id           -> DomainDetailPage
  /admin/mailboxes             -> MailboxListPage
  /admin/aliases               -> AliasListPage
  /admin/logs/mail             -> MailLogsPage
  /admin/logs/audit            -> AuditLogsPage
  /admin/billing               -> AdminBillingPage
  /admin/server                -> ServerHealthPage
  /admin/abuse                 -> AbuseMonitorPage
  /admin/bans                  -> BanManagementPage
  /admin/settings              -> AdminSettingsPage
Client Portal Routes (inside PortalLayout, requires PortalProtected):
  /portal/login                -> PortalLoginPage (public, includes "Forgot Password?" flow)
  /portal (index)              -> PortalDashboardPage
  /portal/getting-started      -> PortalGettingStartedPage
  /portal/domains              -> PortalDomainsPage
  /portal/domains/:id/dns-setup -> PortalDnsSetupPage
  /portal/mailboxes            -> PortalMailboxesPage
  /portal/aliases              -> PortalAliasesPage
  /portal/logs                 -> PortalLogsPage
  /portal/billing              -> PortalBillingPage
  /portal/migration            -> PortalMigrationPage
```

### Page: Landing
```
Location:    frontend/src/pages/landing.tsx
Type:        frontend
Description: Public landing page at / — product features, pricing overview, 3-step setup guide
```

### Page: Login
```
Location:    frontend/src/pages/login.tsx
Type:        frontend
Depends On:  POST /api/auth/login
Description: Admin login page (now at /admin/login)
```

### Page: Dashboard
```
Location:    frontend/src/pages/dashboard.tsx
Type:        frontend
Depends On:  GET /api/dashboard/stats
Description: Overview — total clients, domains, mailboxes, aliases, recent activity
```

### Page: Clients
```
Location:    frontend/src/pages/clients/
Type:        frontend
Depends On:  /api/clients endpoints
Description: List and detail views for client companies
Files:
  list.tsx          -> searchable table of all clients
  detail.tsx        -> single client view with their domains + usage stats
```

### Page: Client Controls
```
Location:    frontend/src/pages/admin/client-controls.tsx
Type:        frontend
Depends On:  PUT /api/admin/clients/:id/controls, GET /api/admin/clients/:id/billing, GET /api/admin/clients/:id/users, POST /api/admin/client-users
Description: Admin view for a single client — service toggle, billing status, limit overrides, portal user management
```

### Page: Domains
```
Location:    frontend/src/pages/domains/
Type:        frontend
Depends On:  /api/clients/:clientId/domains, /api/domains/:id endpoints, /api/domains/:id/dns-guide
Description: Manage domains, verify DNS, see setup status
Files:
  list.tsx          -> all domains with verification status badges
  detail.tsx        -> single domain — DNS PASS/FAIL cards, DNS setup guide (fetched from backend
                       with copy buttons, uses platform settings for hostname/IP), mailboxes table
  dns-guide.tsx     -> legacy static DNS guide component (admin-side, superseded by backend dns-guide)
```

### Page: Mailboxes
```
Location:    frontend/src/pages/mailboxes/
Type:        frontend
Depends On:  /api/domains/:domainId/mailboxes, /api/mailboxes endpoints
Description: Create/manage email accounts under a domain
Files:
  list.tsx          -> table with email, status, quota usage
```

### Page: Aliases
```
Location:    frontend/src/pages/aliases/
Type:        frontend
Depends On:  /api/domains/:domainId/aliases, /api/aliases endpoints
Description: Manage email forwarding rules
Files:
  list.tsx          -> list with source -> destination mapping
```

### Page: Logs
```
Location:    frontend/src/pages/logs/
Type:        frontend
Depends On:  /api/logs endpoints
Description: View mail activity and admin audit trail
Files:
  mail.tsx          -> filterable mail log table (by domain, date, status)
  audit.tsx         -> who did what and when
```

### Page: Billing (Admin)
```
Location:    frontend/src/pages/admin/billing.tsx
Type:        frontend
Depends On:  GET /api/admin/billing/overview, GET /api/admin/invoices, POST /api/admin/invoices, PUT /api/admin/invoices/:id/status, POST /api/admin/payments
Description: Platform-wide billing dashboard — revenue overview, invoice list, create invoices, record payments
```

### Page: Server Health
```
Location:    frontend/src/pages/admin/server-health.tsx
Type:        frontend
Depends On:  GET /api/admin/server/health, GET /api/admin/server/metrics
Description: System monitoring — CPU, memory, disk, database health, Redis health, mail service status, Rspamd stats, Fail2ban status (jails, banned count), SSL certificate expiry per domain, active IMAP connections
```

### Page: Abuse Monitor
```
Location:    frontend/src/pages/admin/abuse.tsx
Type:        frontend
Depends On:  GET /api/admin/abuse/overview, GET /api/admin/abuse/alerts
Description: Abuse monitoring dashboard — Rspamd stats, high volume senders, bounce tracking, outbound by client, auto-refresh alerts
```

### Page: Ban Management
```
Location:    frontend/src/pages/admin/bans.tsx
Type:        frontend
Depends On:  /api/admin/bans/* endpoints
Description: Ban management — Fail2ban IP view/ban/unban, custom blocklist (email/domain/IP) with Rspamd sync, all actions audit logged
```

### Page: Settings
```
Location:    frontend/src/pages/admin/settings.tsx
Type:        frontend
Depends On:  GET /api/admin/settings, PUT /api/admin/settings
Description: Platform settings editor — server hostname, IP, webmail URL, mail config, branding, relay configuration
             Each field shows a blue hint explaining what it does and how to fill it.
             Hints come from the backend (settings.service.ts DEFAULTS).
             Relay group: switch between direct delivery and SMTP relay (auto-applies to Postfix on save).
```

### Admin Shared Components
```
Location:    frontend/src/components/
Type:        frontend (shared)
Files:
  layout.tsx            -> admin layout wrapper (sidebar navigation + notification bell + content area via Outlet)
  portal-layout.tsx     -> client portal layout wrapper (sidebar navigation + notification bell + content area via Outlet)
  data-table.tsx        -> reusable data table component
  dns-status-badge.tsx  -> green/yellow/red indicator per DNS record type
  quota-bar.tsx         -> visual bar showing storage used vs limit
  stat-card.tsx         -> dashboard summary number card
  email-chips.tsx       -> Gmail-style email chip input (To/CC/BCC) — type+Enter, X remove, double-click edit, paste multiple
  rich-editor.tsx       -> Tiptap rich text editor for compose (bold/italic/underline/lists/links/quotes/undo-redo)
  notification-bell.tsx -> bell icon dropdown with unread count badge, scrollable notification list,
                           per-item actions (navigate via action_url, mark read, dismiss),
                           bulk actions (mark all read, clear all)
  sender-avatar.tsx     -> colored circle with initial letter (hash-based color from 10-color palette)
  locale-switcher.tsx   -> EN/हि language toggle component
Admin Sidebar Nav Items:
  Dashboard, Clients, Domains, Mailboxes, Aliases, Mail Logs, Audit Logs, Billing, Server Health, Abuse Monitor, Ban Management, Settings
Icons: lucide-react
```

### Admin Hooks
```
Location:    frontend/src/hooks/
Type:        frontend (shared)
Files:
  use-auth.ts       -> admin login state (isAuthenticated, loading), token management from localStorage
  use-locale.ts     -> LocaleContext + useLocale() hook + useLocaleProvider(), localStorage persistence (wenmail-locale)
```

### i18n (Translations)
```
Location:    frontend/src/i18n/
Type:        frontend (shared)
Files:
  translations.ts   -> Record<Locale, Record<string, string>> — 100+ translated strings
Supported Locales:
  "en" (English), "hi" (Hindi)
Categories:
  common, auth, mail, portal, landing
```

### Admin API Layer
```
Location:    frontend/src/api/
Type:        frontend (shared)
Description: HTTP client and per-resource API functions using ky
Files:
  client.ts         -> ky instance (prefixUrl: "/api", auto Bearer token from localStorage, 401 redirect to /admin/login)
  auth.ts           -> login, logout, refresh API calls
  clients.ts        -> client CRUD API calls
  domains.ts        -> domain CRUD + verify + dns-status + dns-guide API calls (DnsGuide, DnsRecord types)
  mailboxes.ts      -> mailbox CRUD API calls
  admin.ts          -> adminApi object: serverHealth, serverMetrics, updateClientControls, getClientBilling,
                       getClientUsers, createClientUser, listInvoices, createInvoice, updateInvoiceStatus,
                       recordPayment, billingOverview
```

---

## Frontend — Client Portal

### Portal Layout
```
Location:    frontend/src/components/portal-layout.tsx
Type:        frontend
Description: Separate sidebar layout for client portal (slate-800 bg, indigo-600 active, notification bell dropdown with unread count badge)
Sidebar Nav Items:
  Dashboard, Getting Started, Domains, Mailboxes, Aliases, Mail Logs, Billing, Import / Export
Displays: client name + user email in sidebar
```

### Portal Hook
```
Location:    frontend/src/hooks/use-portal-auth.ts
Type:        frontend
Depends On:  portalApi (GET auth/me)
Description: Portal auth state — user, loading, isAuthenticated, logout. Uses portalAccessToken in localStorage.
```

### Portal API Layer
```
Location:    frontend/src/api/portal.ts
Type:        frontend
Description: Separate ky instance for client portal (prefixUrl: "/api/client-portal", portalAccessToken in localStorage, 401 redirect to /portal/login)
Exports:     portalApi instance, PortalUser type, PortalDashboard type, portalLogin(), portalLogout(), getPortalMe()
```

### Portal Pages
```
Location:    frontend/src/pages/portal/
Type:        frontend
Files:
  login.tsx           -> client portal login form (includes "Forgot Password?" flow, login cooldown: 5 fails = 15 min lock)
  dashboard.tsx       -> client overview — domain/mailbox/alias counts, plan limits, quick actions
  getting-started.tsx -> onboarding guide — steps to set up first domain and mailbox
  domains.tsx         -> manage client's own domains (add, verify, view status)
  dns-setup.tsx       -> per-domain DNS setup wizard (personalized instructions from /dns-guide,
                         includes "What are these records?" explainer + step-by-step registrar guide)
  mailboxes.tsx       -> manage mailboxes across client's domains + email setup instructions
                         (webmail URL, IMAP/SMTP settings with copy buttons, shown when mailboxes exist)
  aliases.tsx         -> manage aliases across client's domains (with error handling)
  logs.tsx            -> client's own mail logs (scoped to their domains)
  billing.tsx         -> view invoices and payment history
  migration.tsx       -> import/export: CSV bulk mailbox creation, IMAP sync migration, export info
```

### Webmail Pages
```
Location:    frontend/src/pages/mail/
Type:        frontend
Files:
  contacts.tsx        -> contact management page (search, add, delete, compose-to, sender avatars)
                         Route: /mail/contacts, contacts icon in webmail sidebar
```

---

## Shared Frontend Utilities

### Utilities
```
Location:    frontend/src/lib/
Type:        frontend (shared)
Files:
  utils.ts          -> cn() helper (clsx + tailwind-merge)
```

### Build & Config Files
```
Location:    frontend/
Files:
  package.json      -> dependencies, scripts (dev/build/preview)
  tsconfig.json     -> TypeScript config
  vite.config.ts    -> Vite 6 config with React plugin + TailwindCSS
  index.html        -> SPA entry HTML
  nginx.conf        -> production Nginx config for serving the SPA
  Dockerfile        -> multi-stage build (Vite build -> Nginx serve)
  src/index.css     -> TailwindCSS imports + global styles
```

---

## Infrastructure Configs (Saved)

### infra/
```
Location:    infra/ (repo root)
Type:        config (reference)
Description: Sanitized copies of production infrastructure configs committed to repo
Contents:
  nginx/      -> Nginx site configs (wenvia.global, wpanel, mail)
  postfix/    -> Postfix main.cf, master.cf
  dovecot/    -> Dovecot configs (dovecot.conf, dovecot-sql.conf, conf.d/*)
  rspamd/     -> Rspamd local.d configs (greylisting, RBL, actions, ratelimit, DKIM)
  fail2ban/   -> Fail2ban jail configs
```

---

## Mail Storage

### Maildir
```
Location:    /var/mail/vhosts/{domain}/{user}/
Type:        storage
Depends On:  filesystem (VPS disk)
Used By:     Dovecot (read/write), Postfix (write)
Description: Physical email storage in Maildir format
Structure:
  /var/mail/vhosts/
    example.com/
      john/
        cur/          -> read emails
        new/          -> unread emails
        tmp/          -> emails being delivered
        .Sent/        -> sent folder
        .Drafts/      -> drafts folder
        .Trash/       -> trash folder
        .Junk/        -> spam folder
```

---

## Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:16-alpine | 5432 | Main database (emailplatform) |
| `redis` | redis:7-alpine | 6379 | Cache + job queue (appendonly) |
| `backend` | custom (Dockerfile) | 3000 | Admin API + Client Portal API + BullMQ workers |
| `frontend` | custom (Nginx + React build) | 8080 | Admin dashboard + Client portal SPA |
| `roundcube` | roundcube/roundcubemail | 9000 | Webmail UI |

---

## Port Map

| Port | Service | Protocol | Public? |
|------|---------|----------|---------|
| 25 | Postfix | SMTP (receive) | Yes |
| 587 | Postfix | SMTP Submission (send) | Yes |
| 993 | Dovecot | IMAPS | Yes |
| 995 | Dovecot | POP3S (optional) | Yes |
| 3000 | Backend API | HTTP | No (internal) |
| 5432 | PostgreSQL | TCP | No (internal) |
| 6379 | Redis | TCP | No (internal) |
| 8080 | Frontend | HTTP | No (internal) |
| 9000 | Roundcube | HTTP | No (internal) |
| 11332 | Rspamd | HTTP (milter) | No (internal) |

---

## Roundcube Customization

### Custom Branding
```
Location:    roundcube-custom/
Type:        config (branding)
Used By:     Roundcube Docker container (volume-mounted)
Description: WenMail branding for webmail — logos, CSS, config overrides, setup help page
Files:
  logo.svg             -> WenMail logo (light mode)
  logo-dark.svg        -> WenMail logo (dark mode)
  custom.css           -> glossy indigo theme (light + dark mode), watermark removed
  custom-config.php    -> product_name = "WenMail", support link -> /setup-help.html
  setup-help.html      -> email client setup guide, served via Nginx at mail.wenvia.global/setup-help.html
```

---

## Root Config Files

```
Location:    ./
Files:
  docker-compose.yml  -> all Docker services (postgres, redis, backend, frontend, roundcube)
  .env.example        -> root environment variables (DB_PASSWORD, JWT_SECRET, PLATFORM_DOMAIN, NODE_ENV)
  .gitignore          -> git ignore rules
  docs/               -> ARCHITECTURE.md, PROJECT_DICTIONARY.md, PROJECT_VISION.md
  roundcube-custom/   -> WenMail branding for Roundcube (logos, CSS, config, setup-help page)
```

---

## Complete File Tree

```
.env.example
.gitignore
docker-compose.yml
docs/
  ARCHITECTURE.md
  PROJECT_DICTIONARY.md
  PROJECT_VISION.md
backend/
  .env.example
  Dockerfile
  drizzle.config.ts
  package.json
  tsconfig.json
  src/
    app.ts                              -> Fastify app builder (plugins, admin routes, portal routes, error handler)
    server.ts                           -> entry point (starts server + workers)
    seed.ts                             -> database seed script (admin, plans, demo client + client user)
    config/
      env.ts                            -> Zod-validated environment variables
    db/
      index.ts                          -> Drizzle ORM instance (postgres-js)
      schema.ts                         -> all 21 table definitions + relations
    lib/
      errors.ts                         -> AppError + typed subclasses
      logger.ts                         -> pino logger
      password.ts                       -> argon2 (admin/client user) + SHA512-CRYPT (Dovecot) hashing
      redis.ts                          -> ioredis client + subscriber
      notify.ts                         -> centralized notification service: notify(), notifyAdmin(), notifyClient()
    mail/
      postfix.ts                        -> reloadPostfix(), reloadDovecot()
      dovecot.ts                        -> recalcQuota(), kickUser(), getMailboxStats()
      welcome.ts                        -> sendWelcomeEmail() — IMAP/SMTP setup instructions to new mailboxes
    modules/
      auth/
        auth.routes.ts                  -> login, refresh, me
        auth.service.ts                 -> admin authentication logic
        auth.guard.ts                   -> JWT preHandler hook (admin)
      billing/
        billing.routes.ts               -> admin: client controls, invoices CRUD, payments, client users, billing overview
      client-portal/
        client-auth.guard.ts            -> JWT preHandler hook (client, checks type="client")
        client-auth.routes.ts           -> client login, refresh, me, password change
        portal.routes.ts                -> client self-service: dashboard, domains, mailboxes, aliases, logs, billing, migration
        notification.routes.ts          -> client notification endpoints (list, read, dismiss, clear)
        import-export.routes.ts         -> CSV bulk import, IMAP migration, export info
      clients/
        client.routes.ts                -> CRUD /api/clients
        client.service.ts               -> client business logic + stats
        client.schema.ts                -> Zod validation schemas
      domains/
        domain.routes.ts                -> CRUD + verify + dns-status
        domain.service.ts               -> domain lifecycle + DKIM generation
        dns.service.ts                  -> DNS record verification
      mailboxes/
        mailbox.routes.ts               -> CRUD /api/mailboxes
        mailbox.service.ts              -> mailbox creation + quota enforcement
      aliases/
        alias.routes.ts                 -> CRUD /api/aliases
        alias.service.ts                -> alias management
      plans/
        plan.routes.ts                  -> CRUD /api/plans
        plan.service.ts                 -> plan management
      logs/
        log.routes.ts                   -> GET mail + audit logs
        log.service.ts                  -> filtered queries with pagination
      dashboard/
        dashboard.routes.ts             -> GET /api/dashboard/stats
      server-health/
        health.routes.ts                -> GET /api/admin/server/health + /metrics
      settings/
        settings.routes.ts              -> GET/PUT /api/admin/settings
        settings.service.ts             -> key-value store, defaults, buildDnsInstructions()
      notifications/
        notification.routes.ts          -> admin notification endpoints (list, read, dismiss, clear)
      webmail/
        webmail.routes.ts               -> IMAP endpoints (folders, messages, compose, search)
        contacts.ts                     -> contact management (Redis sorted set, auto-record)
        templates.ts                    -> pre-built email templates (6 templates)
        totp.routes.ts                  -> 2FA TOTP setup/verify/disable/status
        mail-features.routes.ts         -> labels, filter rules, auto-responder, catch-all, forwarding
    workers/
      index.ts                          -> startWorkers() orchestrator
      queues.ts                         -> BullMQ queue definitions
      dns-check.worker.ts              -> hourly DNS re-verification
      domain-setup.worker.ts           -> async domain provisioning
      log-cleanup.worker.ts            -> daily old log deletion
      quota-sync.worker.ts             -> periodic storage usage sync
      mail-log.worker.ts               -> parse Postfix syslog -> mail_logs (every 5 min)
      scheduled-send.worker.ts        -> send pending scheduled emails (every minute)
frontend/
  Dockerfile
  index.html
  nginx.conf
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx                            -> React root + QueryClient provider
    App.tsx                             -> admin routes + portal routes + AdminProtected + PortalProtected
    index.css                           -> TailwindCSS imports
    api/
      auth.ts                           -> admin login/logout/refresh calls
      client.ts                         -> ky HTTP client instance (admin)
      clients.ts                        -> client CRUD calls
      domains.ts                        -> domain CRUD + verify calls
      mailboxes.ts                      -> mailbox CRUD calls
      admin.ts                          -> adminApi: server health, billing, client controls, invoices, payments
      portal.ts                         -> portalApi: separate ky instance for client portal + portalLogin/logout/getMe
    components/
      layout.tsx                        -> admin sidebar (gray-900) + notification bell + Outlet wrapper
      portal-layout.tsx                 -> client portal sidebar (slate-800) + notification bell + Outlet wrapper
      data-table.tsx                    -> reusable data table
      dns-status-badge.tsx              -> DNS record status indicator
      quota-bar.tsx                     -> storage usage bar
      stat-card.tsx                     -> dashboard stat card
      email-chips.tsx                   -> Gmail-style email chip input (To/CC/BCC)
      rich-editor.tsx                   -> Tiptap rich text compose editor
      notification-bell.tsx             -> bell dropdown with unread count, navigate/read/dismiss actions
      sender-avatar.tsx                 -> colored circle with initial letter (hash-based color)
      locale-switcher.tsx               -> EN/हि language toggle component
    hooks/
      use-auth.ts                       -> admin auth state + token management
      use-portal-auth.ts                -> portal auth state + token management (portalAccessToken)
      use-locale.ts                     -> LocaleContext, useLocale() hook, useLocaleProvider()
    i18n/
      translations.ts                   -> multi-language strings (en, hi) — 100+ keys
    lib/
      utils.ts                          -> cn() (clsx + tailwind-merge)
    pages/
      landing.tsx                       -> public landing page (features, pricing, 3-step guide)
      login.tsx                         -> admin login form (at /admin/login)
      dashboard.tsx                     -> admin overview stats page
      admin/
        billing.tsx                     -> platform billing dashboard (invoices, payments, revenue)
        client-controls.tsx             -> per-client service toggle, limits, billing, portal users
        server-health.tsx               -> system monitoring (CPU, memory, disk, DB, Redis, mail services)
        settings.tsx                    -> platform settings editor (server, mail, branding)
      clients/
        list.tsx                        -> client list table
        detail.tsx                      -> client detail + stats
      domains/
        list.tsx                        -> domain list with status badges
        detail.tsx                      -> domain detail + DNS status
        dns-guide.tsx                   -> DNS setup instructions
      mailboxes/
        list.tsx                        -> mailbox list + quota display
      aliases/
        list.tsx                        -> alias list (source -> destination)
      logs/
        mail.tsx                        -> filterable mail log table
        audit.tsx                       -> admin audit trail
      mail/
        contacts.tsx                    -> webmail contacts page (search, add, delete, compose-to)
      portal/
        login.tsx                       -> client portal login form (with forgot password flow, login cooldown)
        dashboard.tsx                   -> client overview (counts, plan limits, quick actions)
        getting-started.tsx             -> onboarding guide (first domain + mailbox setup)
        domains.tsx                     -> client domain management (add, verify, view)
        dns-setup.tsx                   -> per-domain DNS setup wizard with personalized instructions
        mailboxes.tsx                   -> client mailbox management
        aliases.tsx                     -> client alias management
        logs.tsx                        -> client's own mail logs
        billing.tsx                     -> client invoice + payment history
        migration.tsx                   -> import/export: CSV bulk import, IMAP migration, export info
roundcube-custom/
  logo.svg                              -> WenMail logo (light mode)
  logo-dark.svg                         -> WenMail logo (dark mode)
  custom.css                            -> glossy indigo theme (light + dark)
  custom-config.php                     -> product_name, support link config
  setup-help.html                       -> email client setup guide page
```

---

## Grep Cheat Sheet

Find anything fast:

```bash
# Find a module
grep -n "Module:" PROJECT_DICTIONARY.md

# Find what uses PostgreSQL
grep -n "PostgreSQL" PROJECT_DICTIONARY.md

# Find all endpoints
grep -n "GET\|POST\|PUT\|DELETE" PROJECT_DICTIONARY.md

# Find all files in a module
grep -A 20 "Module: billing" PROJECT_DICTIONARY.md

# Find what depends on something
grep -n "Depends On:.*Redis" PROJECT_DICTIONARY.md

# Find all tables
grep -n "^\| \`" PROJECT_DICTIONARY.md

# Find all workers
grep -n "worker" PROJECT_DICTIONARY.md

# Find all portal endpoints
grep -n "client-portal" PROJECT_DICTIONARY.md

# Find all admin-only endpoints
grep -n "/api/admin" PROJECT_DICTIONARY.md
```
