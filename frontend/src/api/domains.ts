import { api } from "./client";

export interface Domain {
  id: string;
  clientId: string;
  domainName: string;
  verified: boolean;
  mxConfigured: boolean;
  spfConfigured: boolean;
  dkimConfigured: boolean;
  dmarcConfigured: boolean;
  status: string;
  createdAt: string;
}

export interface DnsCheckResult {
  type: string;
  pass: boolean;
  raw: string;
}

export const domainsApi = {
  list: (clientId: string) => api.get(`clients/${clientId}/domains`).json<Domain[]>(),
  create: (clientId: string, domainName: string) =>
    api.post(`clients/${clientId}/domains`, { json: { domainName } }).json(),
  verify: (id: string) => api.post(`domains/${id}/verify`).json(),
  dnsStatus: (id: string) => api.get(`domains/${id}/dns-status`).json<DnsCheckResult[]>(),
  delete: (id: string) => api.delete(`domains/${id}`).json(),
};
