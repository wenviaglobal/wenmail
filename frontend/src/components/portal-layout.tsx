import { useState } from "react";
import { Outlet, NavLink } from "react-router";
import { LayoutDashboard, BookOpen, Globe, Mail, ArrowRightLeft, ScrollText, CreditCard, Import, LogOut, Menu, X } from "lucide-react";
import { cn } from "../lib/utils";
import { portalLogout } from "../api/portal";
import { usePortalAuth } from "../hooks/use-portal-auth";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

const navItems = [
  { to: "/portal", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/portal/getting-started", icon: BookOpen, label: "Getting Started" },
  { to: "/portal/domains", icon: Globe, label: "Domains" },
  { to: "/portal/mailboxes", icon: Mail, label: "Mailboxes" },
  { to: "/portal/aliases", icon: ArrowRightLeft, label: "Aliases" },
  { to: "/portal/logs", icon: ScrollText, label: "Mail Logs" },
  { to: "/portal/billing", icon: CreditCard, label: "Billing" },
  { to: "/portal/migration", icon: Import, label: "Import / Export" },
];

export function PortalLayout() {
  const { user } = usePortalAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-60 bg-slate-800 dark:bg-slate-950 text-white flex flex-col transition-transform lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-slate-600 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">WenMail</h1>
            <p className="text-xs text-slate-400 truncate">{user?.clientName ?? "Client Portal"}</p>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/portal"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-800 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-600 dark:border-slate-700">
          <div className="px-3 py-2 text-xs text-slate-400 truncate">{user?.email}</div>
          <div className="flex items-center justify-between">
            <button
              onClick={portalLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <LogOut size={18} />
              Logout
            </button>
            <ThemeToggle />
          </div>
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
            <NotificationBell apiPrefix="client-portal" queryKey="portal-notifs" />
            <ThemeToggle />
          </div>
        </div>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end gap-2 px-6 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <NotificationBell apiPrefix="client-portal" queryKey="portal-notifs" />
          <ThemeToggle />
        </div>

        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
