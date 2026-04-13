import { useQuery } from "@tanstack/react-query";
import { Users, Globe, Mail, ArrowRightLeft, TrendingUp, Shield, Activity, CreditCard } from "lucide-react";
import { api } from "../api/client";
import { adminApi } from "../api/admin";
import { StatCard } from "../components/stat-card";
import { formatDate } from "../lib/utils";
import { Link } from "react-router";

interface DashboardStats {
  clients: number;
  domains: number;
  mailboxes: number;
  aliases: number;
  recentActivity: Array<{
    id: number; direction: string; fromAddress: string; toAddress: string; status: string; createdAt: string;
  }>;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("dashboard/stats").json<DashboardStats>(),
  });

  const { data: billing } = useQuery({
    queryKey: ["billing-overview"],
    queryFn: () => adminApi.billingOverview(),
  });

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <span className="text-xs text-gray-400">Auto-refreshes every 30s</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Clients" value={data?.clients ?? 0} icon={<Users size={24} />} />
        <StatCard title="Domains" value={data?.domains ?? 0} icon={<Globe size={24} />} />
        <StatCard title="Mailboxes" value={data?.mailboxes ?? 0} icon={<Mail size={24} />} />
        <StatCard title="Aliases" value={data?.aliases ?? 0} icon={<ArrowRightLeft size={24} />} />
      </div>

      {/* Revenue + quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-slate-400">Total Revenue</span>
            <CreditCard size={18} className="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-600">${billing?.totalRevenue?.toFixed(2) ?? "0.00"}</p>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span>Pending: ${billing?.pendingAmount?.toFixed(2) ?? "0"}</span>
            <span>Overdue: {billing?.overdueCount ?? 0}</span>
          </div>
        </div>

        <Link to="/admin/abuse" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition group">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={18} className="text-amber-500" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Abuse Monitor</span>
          </div>
          <p className="font-semibold group-hover:text-indigo-600 transition">View spam & abuse alerts →</p>
        </Link>

        <Link to="/admin/server" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition group">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={18} className="text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Server Health</span>
          </div>
          <p className="font-semibold group-hover:text-indigo-600 transition">Monitor services →</p>
        </Link>
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp size={18} /> Recent Mail Activity</h2>
        {!data?.recentActivity?.length ? (
          <p className="text-gray-400 text-sm py-4 text-center">No recent activity — mail logs sync every 5 minutes</p>
        ) : (
          <div className="space-y-2">
            {data.recentActivity.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.direction === "inbound" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {log.direction === "inbound" ? "IN" : "OUT"}
                  </span>
                  <span className="text-gray-600 dark:text-slate-400 truncate max-w-[300px]">{log.fromAddress} → {log.toAddress}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${log.status === "sent" ? "text-green-600" : log.status === "bounced" ? "text-red-600" : "text-yellow-600"}`}>
                    {log.status}
                  </span>
                  <span className="text-gray-400 text-xs">{formatDate(log.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
