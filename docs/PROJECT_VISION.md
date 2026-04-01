# Project Vision — MailPlatform

## Mission Statement

Build a self-hosted, multi-tenant email hosting platform that serves as reliable, secure, and affordable email infrastructure — first for internal company use, then as a managed service for clients.

---

## What We Are Building

A platform where businesses get fully functional email under their own domain, managed entirely by us on our infrastructure.

**In simple terms:**
> "You give us your domain. We give you working email — inboxes, sending, spam protection, webmail — everything handled."

---

## Who Is It For

### Phase 1: Internal
- Our own company team
- Internal communication (hr@, admin@, support@, dev@)

### Phase 2: Clients
- Small-to-medium businesses (30-50 clients)
- Companies that want professional email but don't want to manage servers
- Each client: ~100 mailboxes

---

## Core Principles

### 1. Security First
Every email we handle represents trust. We meet real security standards:
- TLS on every connection
- SPF + DKIM + DMARC on every domain
- Spam filtering and antivirus scanning
- Encrypted password storage
- Audit trail for every admin action

### 2. Domain = Identity
- We never randomly assign email addresses
- Every email lives under a real, verified domain
- Clients own their domain — we just host the mail
- If they leave, they take their domain and emails with them

### 3. Multi-Tenant by Design
- Every client is isolated (separate domain, separate storage)
- One client's problems don't affect another
- Quotas and limits prevent abuse
- Plans control what each client can do

### 4. Migration Freedom
- Clients can import existing email (imapsync)
- Clients can export and leave anytime (Maildir, mbox, IMAP)
- No vendor lock-in — we earn trust, not trap users

### 5. Start Simple, Scale Smart
- Don't over-engineer for 10,000 users on day one
- Build for 50 clients first, design so it can grow to 500
- Single VPS now, separate services later

---

## What Success Looks Like

### Short Term (3-6 months)
- [ ] VPS running with Postfix + Dovecot
- [ ] Internal company email fully working
- [ ] Admin dashboard to manage domains and mailboxes
- [ ] SPF, DKIM, DMARC passing for all domains
- [ ] Emails landing in inbox (not spam) on Gmail/Outlook
- [ ] Webmail (Roundcube) accessible for users

### Medium Term (6-12 months)
- [ ] Onboard first 5-10 external clients
- [ ] DNS verification wizard (guided setup for clients)
- [ ] Per-client usage dashboard
- [ ] Automated backups
- [ ] Monitoring and alerting (uptime, queue size, disk)

### Long Term (12+ months)
- [ ] 30-50 active clients
- [ ] Client self-service portal (manage own mailboxes)
- [ ] Billing integration
- [ ] Multiple server support (failover MX)
- [ ] Advanced features: catch-all, auto-responders, mailing lists
- [ ] Free security certifications where applicable

---

## What We Are NOT Building

- **Not a Gmail/Outlook competitor** — we're infrastructure, not a consumer product
- **Not a marketing email tool** — no mass email, no newsletters (use Mailchimp for that)
- **Not a temporary email service** — real business email only
- **Not reinventing SMTP** — we use proven tools (Postfix, Dovecot) and build management on top

---

## Revenue Model (Future)

| Plan | Target | Price Range | Includes |
|------|--------|-------------|----------|
| Starter | Small teams | Low | 1 domain, 50 mailboxes, 500MB/user |
| Business | Growing companies | Medium | 3 domains, 200 mailboxes, 2GB/user |
| Enterprise | Large orgs | Custom | Unlimited domains, dedicated IP, priority support |

---

## Technical Non-Negotiables

1. **Emails must not go to spam** — proper DNS, IP warmup, authentication
2. **Zero data loss** — daily backups, Maildir format (one file per email)
3. **Always encrypted** — TLS everywhere, no plaintext auth
4. **Auditable** — every admin action logged with who/what/when
5. **Client data isolation** — one client cannot see another's data, ever

---

## Risks We Know About

| Risk | Mitigation |
|------|-----------|
| IP gets blacklisted | Warm up slowly, monitor blacklists, consider SMTP relay for outbound |
| Gmail/Outlook rejects our mail | Strict SPF/DKIM/DMARC, start with low volume |
| Server goes down | Automated monitoring, backup MX (future), daily backups |
| Client sends spam through us | Rate limiting, abuse detection, account suspension |
| Disk fills up | Quota enforcement, monitoring alerts, log rotation |
| Security breach | Fail2ban, firewall, minimal open ports, regular updates |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-01 | Use Postfix + Dovecot | Industry standard, proven at scale, excellent docs |
| 2026-04-01 | PostgreSQL for mail auth | Postfix/Dovecot query SQL directly — no middleware needed |
| 2026-04-01 | Node.js + Fastify for API | Fast, TypeScript support, good for async I/O |
| 2026-04-01 | React + Vite for frontend | Modern, fast builds, large ecosystem |
| 2026-04-01 | Mail on host, apps in Docker | Mail needs direct port/system access; apps benefit from containers |
| 2026-04-01 | Maildir format (not mbox) | One file per email — safer, no corruption risk, easy backup |
