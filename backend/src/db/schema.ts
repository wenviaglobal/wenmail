import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  decimal,
  bigserial,
  timestamp,
  jsonb,
  inet,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// PLANS
// ============================================

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  maxDomains: integer("max_domains").notNull().default(1),
  maxMailboxes: integer("max_mailboxes").notNull().default(50),
  maxAliases: integer("max_aliases").notNull().default(200),
  storagePerMailboxMb: integer("storage_per_mailbox_mb").notNull().default(500),
  maxSendPerDay: integer("max_send_per_day").notNull().default(500),
  priceMonthly: decimal("price_monthly", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const plansRelations = relations(plans, ({ many }) => ({
  clients: many(clients),
}));

// ============================================
// ADMINS
// ============================================

export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// CLIENTS
// ============================================

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 50 }),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: varchar("status", { length: 20 }).default("active"),
  billingStatus: varchar("billing_status", { length: 20 }).default("active"), // 'active','overdue','suspended','trial'
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  serviceEnabledAt: timestamp("service_enabled_at", { withTimezone: true }).defaultNow(),
  serviceDisabledAt: timestamp("service_disabled_at", { withTimezone: true }),
  maxMailboxOverride: integer("max_mailbox_override"), // admin can override plan limit per client
  maxDomainOverride: integer("max_domain_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const clientsRelations = relations(clients, ({ one, many }) => ({
  plan: one(plans, { fields: [clients.planId], references: [plans.id] }),
  domains: many(domains),
  mailboxes: many(mailboxes),
  aliases: many(aliases),
  users: many(clientUsers),
  invoices: many(invoices),
}));

// ============================================
// CLIENT USERS (client-side login accounts)
// ============================================

export const clientUsers = pgTable("client_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).default("owner"), // 'owner', 'manager'
  status: varchar("status", { length: 20 }).default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const clientUsersRelations = relations(clientUsers, ({ one }) => ({
  client: one(clients, { fields: [clientUsers.clientId], references: [clients.id] }),
}));

// ============================================
// INVOICES
// ============================================

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: varchar("status", { length: 20 }).default("pending"), // 'pending','paid','overdue','cancelled'
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  payments: many(payments),
}));

// ============================================
// PAYMENTS
// ============================================

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: varchar("method", { length: 30 }).notNull(), // 'bank_transfer','card','upi','manual'
  transactionRef: varchar("transaction_ref", { length: 255 }),
  status: varchar("status", { length: 20 }).default("completed"), // 'completed','refunded','failed'
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  client: one(clients, { fields: [payments.clientId], references: [clients.id] }),
}));

// ============================================
// DOMAINS
// ============================================

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  domainName: varchar("domain_name", { length: 255 }).notNull().unique(),
  verificationToken: varchar("verification_token", { length: 255 }).notNull(),
  verified: boolean("verified").default(false),
  mxConfigured: boolean("mx_configured").default(false),
  spfConfigured: boolean("spf_configured").default(false),
  dkimConfigured: boolean("dkim_configured").default(false),
  dmarcConfigured: boolean("dmarc_configured").default(false),
  dkimPrivateKey: text("dkim_private_key"),
  dkimPublicKey: text("dkim_public_key"),
  dkimSelector: varchar("dkim_selector", { length: 50 }).default("mail"),
  status: varchar("status", { length: 20 }).default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const domainsRelations = relations(domains, ({ one, many }) => ({
  client: one(clients, { fields: [domains.clientId], references: [clients.id] }),
  mailboxes: many(mailboxes),
  aliases: many(aliases),
  dnsChecks: many(dnsChecks),
}));

// ============================================
// MAILBOXES
// ============================================

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    localPart: varchar("local_part", { length: 64 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    quotaMb: integer("quota_mb").notNull().default(500),
    storageUsedMb: integer("storage_used_mb").default(0),
    status: varchar("status", { length: 20 }).default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("mailbox_domain_local_idx").on(table.domainId, table.localPart),
  ]
);

export const mailboxesRelations = relations(mailboxes, ({ one }) => ({
  domain: one(domains, { fields: [mailboxes.domainId], references: [domains.id] }),
  client: one(clients, { fields: [mailboxes.clientId], references: [clients.id] }),
}));

// ============================================
// ALIASES
// ============================================

export const aliases = pgTable(
  "aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    sourceLocal: varchar("source_local", { length: 64 }).notNull(),
    destination: text("destination").notNull(),
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("alias_domain_source_idx").on(table.domainId, table.sourceLocal),
  ]
);

export const aliasesRelations = relations(aliases, ({ one }) => ({
  domain: one(domains, { fields: [aliases.domainId], references: [domains.id] }),
  client: one(clients, { fields: [aliases.clientId], references: [clients.id] }),
}));

// ============================================
// MAIL LOGS
// ============================================

export const mailLogs = pgTable("mail_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id),
  direction: varchar("direction", { length: 10 }).notNull(),
  fromAddress: varchar("from_address", { length: 255 }),
  toAddress: varchar("to_address", { length: 255 }),
  subject: varchar("subject", { length: 500 }),
  messageId: varchar("message_id", { length: 500 }),
  status: varchar("status", { length: 20 }),
  sizeBytes: integer("size_bytes"),
  postfixQueueId: varchar("postfix_queue_id", { length: 50 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// DNS CHECKS
// ============================================

export const dnsChecks = pgTable("dns_checks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  checkType: varchar("check_type", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  rawResult: text("raw_result"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
});

export const dnsChecksRelations = relations(dnsChecks, ({ one }) => ({
  domain: one(domains, { fields: [dnsChecks.domainId], references: [domains.id] }),
}));

// ============================================
// PLATFORM SETTINGS (key-value config store)
// ============================================

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  label: varchar("label", { length: 255 }),  // human-readable label for UI
  group: varchar("group", { length: 50 }),   // 'server', 'mail', 'branding'
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================
// AUDIT LOG
// ============================================

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: uuid("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: uuid("target_id"),
  details: jsonb("details"),
  ipAddress: inet("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
