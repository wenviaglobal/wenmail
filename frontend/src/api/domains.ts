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

export interface DnsRecord {
  step: number;
  purpose: string;
  type: string;
  host: string;
  hostHint: string;
  value: string;
  priority?: number;
  required: boolean;
  note?: string;
}

export interface DnsGuide {
  summary: { hostname: string; serverIp: string };
  records: DnsRecord[];
}

export const domainsApi = {
  list: (clientId: string) => api.get(`clients/${clientId}/domains`).json<Domain[]>(),
  create: (clientId: string, domainName: string) =>
    api.post(`clients/${clientId}/domains`, { json: { domainName } }).json(),
  verify: (id: string) => api.post(`domains/${id}/verify`).json(),
  dnsStatus: (id: string) => api.get(`domains/${id}/dns-status`).json<DnsCheckResult[]>(),
  dnsGuide: (id: string) => api.get(`domains/${id}/dns-guide`).json<DnsGuide>(),
  delete: (id: string) => api.delete(`domains/${id}`).json(),
};
