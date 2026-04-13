import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bell, X, Check, CheckCheck, Trash2, AlertTriangle, KeyRound, Shield, CreditCard, Globe, Server } from "lucide-react";

const typeIcons: Record<string, typeof Bell> = {
  password_reset: KeyRound,
  domain_dns: Globe,
  abuse_alert: Shield,
  ssl_expiry: Server,
  billing_due: CreditCard,
  mailbox_quota: AlertTriangle,
};

const severityColors: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  severity: string;
  read: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  apiPrefix: string; // "admin" or "client-portal"
  queryKey: string;
}

export function NotificationBell({ apiPrefix, queryKey }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const apiBase = `/api/${apiPrefix}/notifications`;

  const { data: countData } = useQuery({
    queryKey: [queryKey, "unread-count"],
    queryFn: () => fetch(apiBase + "/unread-count", { headers: authHeaders(apiPrefix) }).then(r => r.json()) as Promise<{ count: number }>,
    refetchInterval: 15000,
  });

  const { data: notifs = [] } = useQuery({
    queryKey: [queryKey, "list"],
    queryFn: () => fetch(apiBase, { headers: authHeaders(apiPrefix) }).then(r => r.json()) as Promise<Notification[]>,
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  const unread = countData?.count ?? 0;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(id: string) {
    await fetch(`${apiBase}/${id}/read`, { method: "PUT", headers: authHeaders(apiPrefix) });
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  async function dismiss(id: string) {
    await fetch(`${apiBase}/${id}/dismiss`, { method: "PUT", headers: authHeaders(apiPrefix) });
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  async function markAllRead() {
    await fetch(`${apiBase}/mark-all-read`, { method: "POST", headers: authHeaders(apiPrefix) });
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  async function clearAll() {
    await fetch(`${apiBase}/clear-all`, { method: "POST", headers: authHeaders(apiPrefix) });
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  }

  function handleAction(notif: Notification) {
    markRead(notif.id);
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
      setOpen(false);
    }
  }

  function formatTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 md:w-96 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <h3 className="font-semibold text-sm dark:text-white">Notifications</h3>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1" title="Mark all read">
                  <CheckCheck size={12} /> Read all
                </button>
              )}
              {notifs.length > 0 && (
                <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 ml-2" title="Clear all">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Notifications list */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                No notifications
              </div>
            ) : (
              notifs.map(notif => {
                const Icon = typeIcons[notif.type] || Bell;
                const dotColor = severityColors[notif.severity] || "bg-blue-500";
                return (
                  <div
                    key={notif.id}
                    className={`flex gap-3 px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition ${!notif.read ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""}`}
                    onClick={() => handleAction(notif)}
                  >
                    <div className="shrink-0 mt-0.5 relative">
                      <Icon size={16} className="text-gray-400 dark:text-slate-500" />
                      {!notif.read && <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${dotColor}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${!notif.read ? "font-semibold dark:text-white" : "text-gray-600 dark:text-slate-400"}`}>{notif.title}</p>
                      {notif.message && <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">{notif.message}</p>}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400 dark:text-slate-500">{formatTime(notif.createdAt)}</span>
                        {notif.actionLabel && (
                          <span className="text-xs text-indigo-600 dark:text-indigo-400">{notif.actionLabel} →</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                      className="shrink-0 text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 p-1 mt-0.5"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function authHeaders(apiPrefix: string): Record<string, string> {
  const tokenKey = apiPrefix === "admin" ? "accessToken" : "portalAccessToken";
  const token = localStorage.getItem(tokenKey);
  return { Authorization: token ? `Bearer ${token}` : "" };
}
