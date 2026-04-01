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
  { to: "/", icon: LayoutDashboard, label: "Dashboard", section: "main" },
  { to: "/clients", icon: Users, label: "Clients", section: "main" },
  { to: "/domains", icon: Globe, label: "Domains", section: "main" },
  { to: "/mailboxes", icon: Mail, label: "Mailboxes", section: "main" },
  { to: "/aliases", icon: ArrowRightLeft, label: "Aliases", section: "main" },
  { to: "/logs/mail", icon: ScrollText, label: "Mail Logs", section: "logs" },
  { to: "/logs/audit", icon: Shield, label: "Audit Logs", section: "logs" },
  { to: "/billing", icon: CreditCard, label: "Billing", section: "admin" },
  { to: "/server", icon: Activity, label: "Server Health", section: "admin" },
  { to: "/settings", icon: Settings, label: "Settings", section: "admin" },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold">MailPlatform</h1>
          <p className="text-xs text-gray-400">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
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
