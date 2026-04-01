import { useState, useEffect } from "react";
import { getMe, logout } from "../api/auth";

interface Admin {
  id: string;
  email: string;
  role: string;
}

export function useAuth() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    getMe()
      .then((data) => setAdmin(data.admin))
      .catch(() => {
        localStorage.removeItem("accessToken");
      })
      .finally(() => setLoading(false));
  }, []);

  return { admin, loading, logout, isAuthenticated: !!admin };
}
