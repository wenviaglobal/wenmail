import { api } from "./client";

export interface Mailbox {
  id: string;
  localPart: string;
  domainName: string;
  displayName?: string;
  quotaMb: number;
  storageUsedMb: number;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
}

export const mailboxesApi = {
  list: (domainId: string) => api.get(`domains/${domainId}/mailboxes`).json<Mailbox[]>(),
  get: (id: string) => api.get(`mailboxes/${id}`).json<Mailbox>(),
  create: (domainId: string, data: { localPart: string; password: string; displayName?: string; quotaMb?: number }) =>
    api.post(`domains/${domainId}/mailboxes`, { json: data }).json<Mailbox>(),
  update: (id: string, data: Partial<{ password: string; displayName: string; quotaMb: number; status: string }>) =>
    api.put(`mailboxes/${id}`, { json: data }).json<Mailbox>(),
  delete: (id: string) => api.delete(`mailboxes/${id}`).json(),
};
