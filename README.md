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

## VPS Mail Infrastructure Setup

Mail services run on the VPS host (not Docker). This section covers installing and configuring Postfix, Dovecot, and Rspamd to work with the platform's PostgreSQL database.

### Prerequisites

- Ubuntu 22.04+ VPS with a public IP
- PostgreSQL and Redis running (via `docker compose up -d postgres redis`)
- Database migrated and seeded
- A domain with an A record for `mail.yourdomain.com` pointing to your VPS IP

### 1. Create the vmail system user

All virtual mailboxes are owned by a single system user:

```bash
groupadd -g 5000 vmail
useradd -g vmail -u 5000 -d /var/mail/vhosts -s /usr/sbin/nologin vmail
mkdir -p /var/mail/vhosts
chown -R vmail:vmail /var/mail/vhosts
```

### 2. Install Postfix (SMTP Server)

```bash
apt-get install -y postfix postfix-pgsql
```

Select "Internet Site" when prompted. Then configure:

**`/etc/postfix/main.cf`** — replace with:

```ini
smtpd_banner = $myhostname ESMTP
biff = no
append_dot_mydomain = no
compatibility_level = 3.6

# Hostname — change to your platform's mail hostname
myhostname = mail.yourdomain.com
mydomain = yourdomain.com
myorigin = $mydomain

# Network
inet_interfaces = all
inet_protocols = all
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
mydestination = localhost

# TLS (replace with Let's Encrypt certs in production)
smtpd_tls_cert_file = /etc/ssl/certs/ssl-cert-snakeoil.pem
smtpd_tls_key_file = /etc/ssl/private/ssl-cert-snakeoil.key
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1

smtp_tls_CApath = /etc/ssl/certs
smtp_tls_security_level = may
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache

# SASL auth via Dovecot
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous

# Restrictions
smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination
smtpd_recipient_restrictions = permit_mynetworks permit_sasl_authenticated reject_unauth_destination

# Virtual mailbox setup (PostgreSQL)
virtual_transport = lmtp:unix:private/dovecot-lmtp
virtual_mailbox_domains = pgsql:/etc/postfix/sql/virtual_domains.cf
virtual_mailbox_maps = pgsql:/etc/postfix/sql/virtual_mailbox.cf
virtual_alias_maps = pgsql:/etc/postfix/sql/virtual_alias.cf
virtual_mailbox_base = /var/mail/vhosts
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000

# Size limits
message_size_limit = 52428800
mailbox_size_limit = 0

# Rspamd milter
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:localhost:11332
non_smtpd_milters = inet:localhost:11332

alias_maps = hash:/etc/aliases
alias_database = hash:/etc/aliases
recipient_delimiter = +
```

**`/etc/postfix/master.cf`** — uncomment and configure the submission service:

```
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=may
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=no
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
```

> **Note:** `smtpd_tls_security_level=may` and `smtpd_tls_auth_only=no` allows Roundcube (running in Docker) to authenticate without TLS over the local network. In production with Let's Encrypt certs, change to `encrypt` and `yes`.

#### Postfix SQL Maps

Create `/etc/postfix/sql/` directory and add three files. Replace `<db_password>` with your PostgreSQL password.

**`/etc/postfix/sql/virtual_domains.cf`**
```
user = mailplatform
password = <db_password>
hosts = 127.0.0.1
dbname = emailplatform
query = SELECT domain_name FROM domains WHERE domain_name='%s' AND status='active' AND verified=true
```

**`/etc/postfix/sql/virtual_mailbox.cf`**
```
user = mailplatform
password = <db_password>
hosts = 127.0.0.1
dbname = emailplatform
query = SELECT CONCAT(d.domain_name, '/', m.local_part, '/') FROM mailboxes m JOIN domains d ON m.domain_id = d.id WHERE m.local_part='%u' AND d.domain_name='%d' AND m.status='active'
```

**`/etc/postfix/sql/virtual_alias.cf`**
```
user = mailplatform
password = <db_password>
hosts = 127.0.0.1
dbname = emailplatform
query = SELECT destination FROM aliases a JOIN domains d ON a.domain_id = d.id WHERE a.source_local='%u' AND d.domain_name='%d' AND a.status='active'
```

Secure the files:
```bash
chmod 640 /etc/postfix/sql/*.cf
chown root:postfix /etc/postfix/sql/*.cf
```

### 3. Install Dovecot (IMAP Server)

```bash
apt-get install -y dovecot-core dovecot-imapd dovecot-lmtpd dovecot-pgsql
```

**`/etc/dovecot/conf.d/10-auth.conf`** — disable system auth:

```
auth_mechanisms = plain login

# Comment out system auth, we use SQL via local.conf
#!include auth-system.conf.ext
```

**`/etc/dovecot/local.conf`** — create this file:

```conf
# Protocols
protocols = imap lmtp

# Logging
log_path = /var/log/dovecot.log
info_log_path = /var/log/dovecot-info.log

# Authentication
disable_plaintext_auth = yes
auth_mechanisms = plain login

# Allow plaintext auth from localhost and Docker (Roundcube connects locally)
login_trusted_networks = 127.0.0.0/8 172.16.0.0/12

# SQL auth
passdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf
}
userdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf
}

# Mail location
mail_location = maildir:/var/mail/vhosts/%d/%n
mail_uid = 5000
mail_gid = 5000
mail_privileged_group = vmail
first_valid_uid = 5000
last_valid_uid = 5000

# Namespaces
namespace inbox {
  inbox = yes
  separator = /
  mailbox Drafts { auto = subscribe; special_use = \Drafts }
  mailbox Sent   { auto = subscribe; special_use = \Sent }
  mailbox Trash  { auto = subscribe; special_use = \Trash }
  mailbox Junk   { auto = subscribe; special_use = \Junk }
  mailbox Archive { auto = no; special_use = \Archive }
}

# SSL/TLS (replace with Let's Encrypt certs in production)
ssl = required
ssl_cert = </etc/ssl/certs/ssl-cert-snakeoil.pem
ssl_key = </etc/ssl/private/ssl-cert-snakeoil.key
ssl_min_protocol = TLSv1.2

# LMTP — receives mail from Postfix
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

# Auth service — Postfix uses this for SASL
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0660
    user = vmail
    group = vmail
  }
}

service auth-worker {
  user = vmail
}
```

**`/etc/dovecot/dovecot-sql.conf`** — create this file:

```conf
driver = pgsql
connect = host=127.0.0.1 dbname=emailplatform user=mailplatform password=<db_password>
default_pass_scheme = SHA512-CRYPT

password_query = \
  SELECT CONCAT(m.local_part, '@', d.domain_name) AS user, \
         m.password_hash AS password \
  FROM mailboxes m JOIN domains d ON m.domain_id = d.id \
  WHERE m.local_part = '%n' AND d.domain_name = '%d' AND m.status = 'active'

user_query = \
  SELECT CONCAT('/var/mail/vhosts/', d.domain_name, '/', m.local_part) AS home, \
         5000 AS uid, 5000 AS gid, \
         CONCAT('*:bytes=', m.quota_mb * 1048576) AS quota_rule \
  FROM mailboxes m JOIN domains d ON m.domain_id = d.id \
  WHERE m.local_part = '%n' AND d.domain_name = '%d' AND m.status = 'active'

iterate_query = \
  SELECT CONCAT(m.local_part, '@', d.domain_name) AS user \
  FROM mailboxes m JOIN domains d ON m.domain_id = d.id \
  WHERE m.status = 'active'
```

Secure the file:
```bash
chmod 600 /etc/dovecot/dovecot-sql.conf
```

### 4. Install Rspamd (Spam Filter)

```bash
apt-get install -y lsb-release wget gpg
wget -qO- https://rspamd.com/apt-stable/gpg.key | gpg --dearmor > /etc/apt/trusted.gpg.d/rspamd.gpg
echo "deb http://rspamd.com/apt-stable/ $(lsb_release -cs) main" > /etc/apt/sources.list.d/rspamd.list
apt-get update && apt-get install -y rspamd
```

Create config files in `/etc/rspamd/local.d/`:

**`worker-proxy.inc`**
```
bind_socket = "localhost:11332";
milter = yes;
timeout = 120s;
upstream "local" {
  default = yes;
  self_scan = yes;
}
```

**`redis.conf`**
```
servers = "127.0.0.1:6379";
```

**`classifier-bayes.conf`**
```
backend = "redis";
autolearn = true;
```

**`dkim_signing.conf`**
```
path = "/var/mail/dkim/$domain.$selector.key";
selector = "mail";
allow_username_mismatch = true;
enabled = true;
```

Create the DKIM key directory:
```bash
mkdir -p /var/mail/dkim
chown -R vmail:vmail /var/mail/dkim
```

### 5. Start All Mail Services

```bash
# Validate configs
postfix check
doveconf -n > /dev/null

# Start services
systemctl start postfix dovecot rspamd
systemctl enable postfix dovecot rspamd

# Verify
systemctl status postfix dovecot rspamd
```

### 6. Firewall Rules (Docker -> Host)

If Roundcube runs in Docker, allow it to reach the host mail services:

```bash
iptables -I INPUT -i docker0 -p tcp --dport 143 -j ACCEPT
iptables -I INPUT -i docker0 -p tcp --dport 993 -j ACCEPT
iptables -I INPUT -i docker0 -p tcp --dport 587 -j ACCEPT
iptables -I INPUT -i docker0 -p tcp --dport 25 -j ACCEPT
```

### 7. Set Up Roundcube (Webmail)

```bash
docker run -d --name wenmail-roundcube --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -p 9000:80 \
  -e ROUNDCUBEMAIL_DEFAULT_HOST=host.docker.internal \
  -e ROUNDCUBEMAIL_DEFAULT_PORT=143 \
  -e ROUNDCUBEMAIL_SMTP_SERVER=host.docker.internal \
  -e ROUNDCUBEMAIL_SMTP_PORT=587 \
  roundcube/roundcubemail:latest
```

### 8. Nginx Reverse Proxy

Install Nginx if not present: `apt-get install -y nginx`

Create `/etc/nginx/sites-available/wenmail`:

```nginx
# Admin Dashboard + Client Portal
server {
    listen 80;
    server_name <your-vps-ip>;

    location / {
        proxy_pass http://127.0.0.1:5173;   # dev (use 8080 for prod)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Webmail (Roundcube)
server {
    listen 80;
    server_name mail.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:
```bash
ln -sf /etc/nginx/sites-available/wenmail /etc/nginx/sites-enabled/wenmail
nginx -t && systemctl reload nginx
```

### 9. Set Server Hostname

```bash
hostnamectl set-hostname mail.yourdomain.com
```

### 10. DNS Records (at your registrar)

**Platform setup (one-time):**

| Type | Host | Value |
|------|------|-------|
| A | `mail` | `<your-vps-ip>` |

**Per-client domain (shown in portal DNS Guide):**

| Type | Host | Value |
|------|------|-------|
| MX | `@` | `mail.yourdomain.com` (priority 10) |
| TXT | `@` | `mailplatform-verify=<token>` |
| TXT | `@` | `v=spf1 ip4:<vps-ip> include:mail.yourdomain.com ~all` |
| TXT | `mail._domainkey` | `v=DKIM1; k=rsa; p=<generated-key>` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` |

### 11. PTR Record (Reverse DNS)

**Critical for email delivery.** Set at your VPS provider (not your domain registrar):

```
<your-vps-ip>  →  mail.yourdomain.com
```

Without this, Gmail/Outlook will reject your emails. Log into your VPS provider's panel and find "Reverse DNS" or "PTR Record" settings.

### 12. Seed Platform Settings

After the backend is running, configure platform settings via Admin > Settings page:

| Setting | Value |
|---------|-------|
| `server.hostname` | `mail.yourdomain.com` |
| `server.ip` | `<your-vps-ip>` |
| `server.webmail_url` | `https://mail.yourdomain.com` |
| `mail.postmaster_email` | `postmaster@yourdomain.com` |
| `mail.dmarc_email` | `dmarc@yourdomain.com` |
| `branding.platform_name` | `Your Platform Name` |

These values are used in DNS guides shown to all clients.

### Port Map

| Port | Service | Protocol | Public? |
|------|---------|----------|---------|
| 25 | Postfix | SMTP (receive) | Yes |
| 587 | Postfix | SMTP Submission (send) | Yes |
| 993 | Dovecot | IMAPS | Yes |
| 143 | Dovecot | IMAP (local/Docker only) | No |
| 3000 | Backend API | HTTP | No (behind Nginx) |
| 5173 | Frontend (dev) | HTTP | No (behind Nginx) |
| 5432 | PostgreSQL | TCP | No (Docker internal) |
| 6379 | Redis | TCP | No (Docker internal) |
| 9000 | Roundcube | HTTP | No (behind Nginx) |
| 11332 | Rspamd | HTTP (milter) | No |

## Production Deployment

All app services run in Docker:

```bash
docker compose up -d
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design, data flows, and security checklist.

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
