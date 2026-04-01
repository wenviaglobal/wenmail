import ky from "ky";

// Separate ky instance for client portal — uses different token storage
export const portalApi = ky.create({
  prefixUrl: "/api/client-portal",
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem("portalAccessToken");
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
      },
    ],
    afterResponse: [
      async (_req, _opts, response) => {
        if (response.status === 401) {
          localStorage.removeItem("portalAccessToken");
          localStorage.removeItem("portalRefreshToken");
          window.location.href = "/portal/login";
        }
      },
    ],
  },
});

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string;
  clientName: string;
}

export interface PortalDashboard {
  domains: number;
  mailboxes: number;
  aliases: number;
  plan: { name: string; maxDomains: number; maxMailboxes: number };
  limits: { maxDomains: number; maxMailboxes: number; maxAliases: number; storagePerMailboxMb: number };
}

export async function portalLogin(email: string, password: string) {
  const data = await portalApi
    .post("auth/login", { json: { email, password } })
    .json<{ accessToken: string; refreshToken: string; user: PortalUser }>();
  localStorage.setItem("portalAccessToken", data.accessToken);
  localStorage.setItem("portalRefreshToken", data.refreshToken);
  return data;
}

export function portalLogout() {
  localStorage.removeItem("portalAccessToken");
  localStorage.removeItem("portalRefreshToken");
  window.location.href = "/portal/login";
}

export async function getPortalMe() {
  return portalApi.get("auth/me").json<{ user: PortalUser }>();
}
