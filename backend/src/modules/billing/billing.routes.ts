import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { authGuard } from "../auth/auth.guard.js";
import { db } from "../../db/index.js";
import { invoices, payments, clients, clientUsers } from "../../db/schema.js";
import { NotFoundError } from "../../lib/errors.js";
import { nanoid } from "nanoid";
import { hashPassword } from "../../lib/password.js";

const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
});

const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(["bank_transfer", "card", "upi", "manual"]),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
});

const updateClientControlSchema = z.object({
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  billingStatus: z.enum(["active", "overdue", "suspended", "trial"]).optional(),
  maxMailboxOverride: z.number().int().min(1).nullable().optional(),
  maxDomainOverride: z.number().int().min(1).nullable().optional(),
});

const createClientUserSchema = z.object({
  clientId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  role: z.enum(["owner", "manager"]).default("owner"),
});

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // ==========================================
  // ADMIN: CLIENT CONTROLS
  // ==========================================

  // PUT /api/admin/clients/:id/controls — service toggle, limit override, billing status
  app.put<{ Params: { id: string } }>("/clients/:id/controls", async (request) => {
    const body = updateClientControlSchema.parse(request.body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "active") updates.serviceEnabledAt = new Date();
      if (body.status === "suspended" || body.status === "cancelled") updates.serviceDisabledAt = new Date();
    }
    if (body.billingStatus !== undefined) updates.billingStatus = body.billingStatus;
    if (body.maxMailboxOverride !== undefined) updates.maxMailboxOverride = body.maxMailboxOverride;
    if (body.maxDomainOverride !== undefined) updates.maxDomainOverride = body.maxDomainOverride;

    const [client] = await db
      .update(clients)
      .set(updates)
      .where(eq(clients.id, request.params.id))
      .returning();

    if (!client) throw new NotFoundError("Client", request.params.id);
    return client;
  });

  // GET /api/admin/clients/:id/billing — admin views client billing summary
  app.get<{ Params: { id: string } }>("/clients/:id/billing", async (request) => {
    const clientId = request.params.id;

    const [client, clientInvoices, clientPayments] = await Promise.all([
      db.query.clients.findFirst({ where: eq(clients.id, clientId), with: { plan: true } }),
      db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt)),
      db.select().from(payments).where(eq(payments.clientId, clientId)).orderBy(desc(payments.paidAt)),
    ]);

    if (!client) throw new NotFoundError("Client", clientId);

    const totalBilled = clientInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
    const totalPaid = clientPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const outstanding = totalBilled - totalPaid;

    return {
      client,
      billing: { totalBilled, totalPaid, outstanding, currency: "USD" },
      invoices: clientInvoices,
      payments: clientPayments,
    };
  });

  // ==========================================
  // ADMIN: INVOICES
  // ==========================================

  // GET /api/admin/invoices — list all invoices
  app.get("/invoices", async (request) => {
    const query = request.query as Record<string, string>;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = Math.min(query.limit ? parseInt(query.limit) : 50, 100);

    const data = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.amount,
        currency: invoices.currency,
        status: invoices.status,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        createdAt: invoices.createdAt,
        clientName: clients.name,
        clientId: clients.id,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return data;
  });

  // POST /api/admin/invoices — create invoice
  app.post("/invoices", async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;

    const [invoice] = await db.insert(invoices).values({
      clientId: body.clientId,
      invoiceNumber,
      amount: body.amount,
      currency: body.currency,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      dueDate: new Date(body.dueDate),
      notes: body.notes,
    }).returning();

    return reply.status(201).send(invoice);
  });

  // PUT /api/admin/invoices/:id/status
  app.put<{ Params: { id: string } }>("/invoices/:id/status", async (request) => {
    const { status } = z.object({ status: z.enum(["pending", "paid", "overdue", "cancelled"]) }).parse(request.body);

    const updates: Record<string, unknown> = { status };
    if (status === "paid") updates.paidAt = new Date();

    const [invoice] = await db.update(invoices).set(updates).where(eq(invoices.id, request.params.id)).returning();
    if (!invoice) throw new NotFoundError("Invoice", request.params.id);
    return invoice;
  });

  // ==========================================
  // ADMIN: PAYMENTS
  // ==========================================

  // POST /api/admin/payments — record a payment
  app.post("/payments", async (request, reply) => {
    const body = recordPaymentSchema.parse(request.body);

    // Get invoice to find clientId
    const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, body.invoiceId) });
    if (!invoice) throw new NotFoundError("Invoice", body.invoiceId);

    const [payment] = await db.insert(payments).values({
      invoiceId: body.invoiceId,
      clientId: invoice.clientId,
      amount: body.amount,
      method: body.method,
      transactionRef: body.transactionRef,
      notes: body.notes,
    }).returning();

    // Auto-mark invoice as paid if payment covers full amount
    if (parseFloat(body.amount) >= parseFloat(invoice.amount)) {
      await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, body.invoiceId));
    }

    return reply.status(201).send(payment);
  });

  // ==========================================
  // ADMIN: CLIENT USER MANAGEMENT
  // ==========================================

  // GET /api/admin/clients/:id/users
  app.get<{ Params: { id: string } }>("/clients/:id/users", async (request) => {
    return db.select({
      id: clientUsers.id,
      email: clientUsers.email,
      name: clientUsers.name,
      role: clientUsers.role,
      status: clientUsers.status,
      lastLoginAt: clientUsers.lastLoginAt,
      createdAt: clientUsers.createdAt,
    }).from(clientUsers).where(eq(clientUsers.clientId, request.params.id));
  });

  // POST /api/admin/clients/:id/users — create client portal user
  app.post("/client-users", async (request, reply) => {
    const body = createClientUserSchema.parse(request.body);

    const client = await db.query.clients.findFirst({ where: eq(clients.id, body.clientId) });
    if (!client) throw new NotFoundError("Client", body.clientId);

    const passwordHash = await hashPassword(body.password);
    const [user] = await db.insert(clientUsers).values({
      clientId: body.clientId,
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name,
      role: body.role,
    }).returning({
      id: clientUsers.id,
      email: clientUsers.email,
      name: clientUsers.name,
      role: clientUsers.role,
    });

    return reply.status(201).send(user);
  });

  // ==========================================
  // ADMIN: OVERVIEW
  // ==========================================

  // GET /api/admin/billing/overview — platform-wide billing stats
  app.get("/billing/overview", async () => {
    const [[totalRevenue], [pendingInvoices], [overdueCount]] = await Promise.all([
      db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` }).from(payments),
      db.select({ total: sql<string>`COALESCE(SUM(amount), 0)`, count: sql<number>`COUNT(*)` })
        .from(invoices).where(eq(invoices.status, "pending")),
      db.select({ count: sql<number>`COUNT(*)` }).from(invoices).where(eq(invoices.status, "overdue")),
    ]);

    return {
      totalRevenue: parseFloat(totalRevenue.total),
      pendingAmount: parseFloat(pendingInvoices.total),
      pendingCount: pendingInvoices.count,
      overdueCount: overdueCount.count,
    };
  });
}
