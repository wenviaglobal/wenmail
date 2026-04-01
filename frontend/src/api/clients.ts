import { api } from "./client";

export interface Client {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  planId: string;
  status: string;
  createdAt: string;
  plan?: { name: string };
  stats?: { domainCount: number; mailboxCount: number; aliasCount: number };
}

export const clientsApi = {
  list: () => api.get("clients").json<Client[]>(),
  get: (id: string) => api.get(`clients/${id}`).json<Client>(),
  create: (data: Partial<Client>) => api.post("clients", { json: data }).json<Client>(),
  update: (id: string, data: Partial<Client>) => api.put(`clients/${id}`, { json: data }).json<Client>(),
  delete: (id: string) => api.delete(`clients/${id}`).json<Client>(),
};
