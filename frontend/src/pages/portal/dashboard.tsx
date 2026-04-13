import { useQuery } from "@tanstack/react-query";
import { Globe, Mail, ArrowRightLeft, HardDrive, TrendingUp, Shield } from "lucide-react";
import { portalApi, type PortalDashboard } from "../../api/portal";
import { StatCard } from "../../components/stat-card";
import { QuotaBar } from "../../components/quota-bar";
import { Link } from "react-router";

export function PortalDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: () => portalApi.get("dashboard").json<PortalDashboard>(),
  });

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  const domainPct = data ? Math.round((data.domains / data.limits.maxDomains) * 100) : 0;
  const mailboxPct = data ? Math.round((data.mailboxes / data.limits.maxMailboxes) * 100) : 0;
  const aliasPct = data ? Math.round((data.aliases / data.limits.maxAliases) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-gray-500 dark:text-slate-400">Plan: <strong className="text-indigo-600 dark:text-indigo-400">{data?.plan.name}</strong></span>
      </div>

      {/* Usage cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Domains" value={`${data?.domains ?? 0} / ${data?.limits.maxDomains}`} icon={<Globe size={24} />}
          subtitle={`${domainPct}% used`} />
        <StatCard title="Mailboxes" value={`${data?.mailboxes ?? 0} / ${data?.limits.maxMailboxes}`} icon={<Mail size={24} />}
          subtitle={`${mailboxPct}% used`} />
        <StatCard title="Aliases" value={`${data?.aliases ?? 0} / ${data?.limits.maxAliases}`} icon={<ArrowRightLeft size={24} />}
          subtitle={`${aliasPct}% used`} />
      </div>

      {/* Usage bars */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Resource Usage</h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-slate-400">Domains</span>
              <span className="font-medium">{data?.domains ?? 0} of {data?.limits.maxDomains}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${domainPct > 80 ? "bg-red-500" : domainPct > 50 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${Math.max(domainPct, 2)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-slate-400">Mailboxes</span>
              <span className="font-medium">{data?.mailboxes ?? 0} of {data?.limits.maxMailboxes}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${mailboxPct > 80 ? "bg-red-500" : mailboxPct > 50 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${Math.max(mailboxPct, 2)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-slate-400">Aliases</span>
              <span className="font-medium">{data?.aliases ?? 0} of {data?.limits.maxAliases}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${aliasPct > 80 ? "bg-red-500" : aliasPct > 50 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${Math.max(aliasPct, 2)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-slate-400">Storage / mailbox</span>
              <span className="font-medium">{data?.limits.storagePerMailboxMb >= 1024 ? `${(data.limits.storagePerMailboxMb / 1024).toFixed(1)} GB` : `${data?.limits.storagePerMailboxMb} MB`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link to="/portal/domains" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition group">
          <Globe size={20} className="text-indigo-500 mb-2" />
          <h3 className="font-semibold group-hover:text-indigo-600 transition">Manage Domains</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Add domains, configure DNS, verify</p>
        </Link>
        <Link to="/portal/mailboxes" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition group">
          <Mail size={20} className="text-indigo-500 mb-2" />
          <h3 className="font-semibold group-hover:text-indigo-600 transition">Manage Mailboxes</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Create accounts, reset passwords</p>
        </Link>
        <Link to="/portal/migration" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition group">
          <TrendingUp size={20} className="text-indigo-500 mb-2" />
          <h3 className="font-semibold group-hover:text-indigo-600 transition">Import / Export</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Bulk create, migrate from old provider</p>
        </Link>
      </div>

      {/* Plan details */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Shield size={18} className="text-indigo-500" /> Plan Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-slate-400">Plan</span>
            <p className="font-semibold text-lg">{data?.plan.name}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">Max Domains</span>
            <p className="font-semibold">{data?.limits.maxDomains}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">Max Mailboxes</span>
            <p className="font-semibold">{data?.limits.maxMailboxes}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-slate-400">Storage / Mailbox</span>
            <p className="font-semibold">{data?.limits.storagePerMailboxMb >= 1024 ? `${(data.limits.storagePerMailboxMb / 1024).toFixed(1)} GB` : `${data?.limits.storagePerMailboxMb} MB`}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
