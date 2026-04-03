import { api } from "./client";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  admin: { id: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await api.post("auth/login", { json: { email, password } }).json<LoginResponse>();
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  return data;
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  window.location.href = "/admin/login";
}

export async function getMe() {
  return api.get("auth/me").json<{ admin: { id: string; email: string; role: string } }>();
}
