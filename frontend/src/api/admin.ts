import { api } from "./client";

export interface ServerHealth {
  system: {
    hostname: string;
    platform: string;
    uptime: number;
    cpu: { model: string; cores: number; loadAvg: number[] };
    memory: { totalGb: number; usedGb: number; freeGb: number; usedPercent: number };
  };
  database: { status: string; latencyMs: number; sizeGb: number; activeConnections: number };
  redis: { status: string; latencyMs: number; usedMemory: string; totalKeys: number };
  mail: Record<string, { status: string; details?: string }>;
  disk: Array<{ filesystem: string; size: string; used: string; available: string; usePercent: string; mountedOn: string }>;
  timestamp: string;
}

export interface BillingOverview {
  totalRevenue: number;
  pendingAmount: number;
  pendingCount: number;
  overdueCount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  clientName: string;
  clientId: string;
}

export const adminApi = {
  // Server health
  serverHealth: () => api.get("admin/server/health").json<ServerHealth>(),
  serverMetrics: () => api.get("admin/server/metrics").json(),

  // Client controls
  updateClientControls: (id: string, data: {
    status?: string;
    billingStatus?: string;
    maxMailboxOverride?: number | null;
    maxDomainOverride?: number | null;
  }) => api.put(`admin/clients/${id}/controls`, { json: data }).json(),

  getClientBilling: (id: string) => api.get(`admin/clients/${id}/billing`).json(),
  getClientUsers: (id: string) => api.get(`admin/clients/${id}/users`).json(),

  // Client user management
  createClientUser: (data: { clientId: string; email: string; password: string; name: string; role?: string }) =>
    api.post("admin/client-users", { json: data }).json(),

  // Invoices
  listInvoices: () => api.get("admin/invoices").json<Invoice[]>(),
  createInvoice: (data: { clientId: string; amount: string; periodStart: string; periodEnd: string; dueDate: string }) =>
    api.post("admin/invoices", { json: data }).json(),
  updateInvoiceStatus: (id: string, status: string) =>
    api.put(`admin/invoices/${id}/status`, { json: { status } }).json(),

  // Payments
  recordPayment: (data: { invoiceId: string; amount: string; method: string; transactionRef?: string }) =>
    api.post("admin/payments", { json: data }).json(),

  // Billing overview
  billingOverview: () => api.get("admin/billing/overview").json<BillingOverview>(),

  // Password reset requests
  listPasswordResets: () => api.get("admin/password-resets").json<PasswordResetRequest[]>(),
  resolvePasswordReset: (id: string, data: { newPassword: string; notes?: string }) =>
    api.put(`admin/password-resets/${id}`, { json: data }).json(),
};

export interface PasswordResetRequest {
  id: string;
  email: string;
  status: string;
  clientName: string;
  clientId: string;
  createdAt: string;
}
