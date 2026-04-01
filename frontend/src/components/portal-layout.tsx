import { Outlet, NavLink } from "react-router";
import { LayoutDashboard, BookOpen, Globe, Mail, ArrowRightLeft, ScrollText, CreditCard, Import, LogOut } from "lucide-react";
import { cn } from "../lib/utils";
import { portalLogout } from "../api/portal";
import { usePortalAuth } from "../hooks/use-portal-auth";

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

  return (
    <div className="flex h-screen">
      <aside className="w-60 bg-slate-800 text-white flex flex-col">
        <div className="p-4 border-b border-slate-600">
          <h1 className="text-lg font-bold">MailPlatform</h1>
          <p className="text-xs text-slate-400 truncate">{user?.clientName ?? "Client Portal"}</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/portal"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-600">
          <div className="px-3 py-2 text-xs text-slate-400 truncate">{user?.email}</div>
          <button
            onClick={portalLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-700 hover:text-white w-full"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
