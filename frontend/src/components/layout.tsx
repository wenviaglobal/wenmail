import { Outlet, NavLink } from "react-router";
import {
  LayoutDashboard,
  Users,
  Globe,
  Mail,
  ArrowRightLeft,
  ScrollText,
  Shield,
  CreditCard,
  Activity,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "../lib/utils";
import { logout } from "../api/auth";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", section: "main" },
  { to: "/admin/clients", icon: Users, label: "Clients", section: "main" },
  { to: "/admin/domains", icon: Globe, label: "Domains", section: "main" },
  { to: "/admin/mailboxes", icon: Mail, label: "Mailboxes", section: "main" },
  { to: "/admin/aliases", icon: ArrowRightLeft, label: "Aliases", section: "main" },
  { to: "/admin/logs/mail", icon: ScrollText, label: "Mail Logs", section: "logs" },
  { to: "/admin/logs/audit", icon: Shield, label: "Audit Logs", section: "logs" },
  { to: "/admin/billing", icon: CreditCard, label: "Billing", section: "admin" },
  { to: "/admin/server", icon: Activity, label: "Server Health", section: "admin" },
  { to: "/admin/settings", icon: Settings, label: "Settings", section: "admin" },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">WenMail</h1>
          <p className="text-xs text-gray-400">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-700">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white w-full"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
