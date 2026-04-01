import { useState, useEffect } from "react";
import { getPortalMe, portalLogout, type PortalUser } from "../api/portal";

export function usePortalAuth() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("portalAccessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    getPortalMe()
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem("portalAccessToken"))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, logout: portalLogout, isAuthenticated: !!user };
}
