import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Globe, Mail, ArrowRightLeft, ScrollText, Shield,
  CreditCard, Activity, Settings, KeyRound, LogOut, Menu, X, ShieldAlert, Ban, Bell,
} from "lucide-react";
import { cn } from "../lib/utils";
import { api } from "../api/client";
import { logout } from "../api/auth";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", section: "main" },
  { to: "/admin/clients", icon: Users, label: "Clients", section: "main" },
  { to: "/admin/domains", icon: Globe, label: "Domains", section: "main" },
  { to: "/admin/mailboxes", icon: Mail, label: "Mailboxes", section: "main" },
  { to: "/admin/aliases", icon: ArrowRightLeft, label: "Aliases", section: "main" },
  { to: "/admin/logs/mail", icon: ScrollText, label: "Mail Logs", section: "logs" },
  { to: "/admin/logs/audit", icon: Shield, label: "Audit Logs", section: "logs" },
  { to: "/admin/billing", icon: CreditCard, label: "Billing", section: "admin" },
  { to: "/admin/abuse", icon: ShieldAlert, label: "Abuse Monitor", section: "admin" },
  { to: "/admin/bans", icon: Ban, label: "Ban Management", section: "admin" },
  { to: "/admin/password-resets", icon: KeyRound, label: "Password Resets", section: "admin" },
  { to: "/admin/server", icon: Activity, label: "Server Health", section: "admin" },
  { to: "/admin/settings", icon: Settings, label: "Settings", section: "admin" },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const { data: resetCount } = useQuery({
    queryKey: ["admin-reset-count"],
    queryFn: () => api.get("admin/password-resets").json<any[]>().then(r => r.filter((x: any) => x.status === "pending").length),
    refetchInterval: 30000,
  });

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-60 bg-gray-900 dark:bg-slate-950 text-white flex flex-col transition-transform lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-gray-700 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">WenMail</h1>
            <p className="text-xs text-gray-400">Admin Dashboard</p>
          </div>
          <button className="lg:hidden text-gray-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 dark:hover:bg-slate-800 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-700 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <LogOut size={18} />
            Logout
          </button>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-slate-300">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold dark:text-white">WenMail</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("/admin/password-resets")} className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition">
              <Bell size={18} />
              {(resetCount ?? 0) > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{resetCount}</span>}
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end gap-2 px-6 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button onClick={() => navigate("/admin/password-resets")} className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition" title="Password reset requests">
            <Bell size={18} />
            {(resetCount ?? 0) > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{resetCount}</span>}
          </button>
          <ThemeToggle />
        </div>

        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
