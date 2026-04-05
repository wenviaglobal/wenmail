import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, AlertTriangle, AlertCircle, Mail, TrendingUp, BarChart3, RefreshCw } from "lucide-react";
import { api } from "../../api/client";

interface AbuseOverview {
  rspamd: { scanned: string; rejected: string; greylist: string; spamRate: string };
  stats: { total24h: number; outbound24h: number; inbound24h: number; bounced24h: number; rejected24h: number; total7d: number };
  queueSize: number;
  highVolumeSenders: Array<{ fromAddress: string; domainName: string; clientName: string; sent: number }>;
  bouncedSenders: Array<{ fromAddress: string; domainName: string; count: number }>;
  outboundByClient: Array<{ clientName: string; domainName: string; sent: number }>;
}

interface Alert {
  level: string;
  message: string;
  detail: string;
}

export function AbusePage() {
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ["abuse-overview"],
    queryFn: () => api.get("admin/abuse/overview").json<AbuseOverview>(),
    refetchInterval: 60000,
  });

  const { data: alertData } = useQuery({
    queryKey: ["abuse-alerts"],
    queryFn: () => api.get("admin/abuse/alerts").json<{ alerts: Alert[]; count: number }>(),
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500">Loading abuse data...</div>;

  const stats = overview?.stats;
  const alerts = alertData?.alerts || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldAlert size={24} className="text-red-500" />
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Abuse & Spam Monitor</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Real-time spam detection, bounce tracking, and client usage alerts</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-lg border ${
              alert.level === "critical"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            }`}>
              {alert.level === "critical"
                ? <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                : <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />}
              <div>
                <p className={`font-medium text-sm ${alert.level === "critical" ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>{alert.message}</p>
                <p className={`text-xs mt-0.5 ${alert.level === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
          <ShieldAlert size={16} /> No active alerts — all systems healthy
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatBox label="Total (24h)" value={stats?.total24h ?? 0} icon={<Mail size={18} />} />
        <StatBox label="Outbound (24h)" value={stats?.outbound24h ?? 0} icon={<TrendingUp size={18} />} />
        <StatBox label="Bounced (24h)" value={stats?.bounced24h ?? 0} icon={<AlertTriangle size={18} />} color={stats?.bounced24h && stats.bounced24h > 10 ? "red" : undefined} />
        <StatBox label="Queue" value={overview?.queueSize ?? 0} icon={<BarChart3 size={18} />} color={overview?.queueSize && overview.queueSize > 20 ? "amber" : undefined} />
      </div>

      {/* Rspamd stats */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3 dark:text-white">Rspamd Spam Filter</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500 dark:text-slate-400">Scanned</span><p className="font-semibold text-lg dark:text-white">{overview?.rspamd.scanned}</p></div>
          <div><span className="text-gray-500 dark:text-slate-400">Rejected</span><p className="font-semibold text-lg text-red-600">{overview?.rspamd.rejected}</p></div>
          <div><span className="text-gray-500 dark:text-slate-400">Greylisted</span><p className="font-semibold text-lg text-amber-600">{overview?.rspamd.greylist}</p></div>
          <div><span className="text-gray-500 dark:text-slate-400">Spam tagged</span><p className="font-semibold text-lg text-orange-600">{overview?.rspamd.spamRate}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* High volume senders */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3 dark:text-white flex items-center gap-2">
            <TrendingUp size={18} className="text-orange-500" /> High Volume Senders (24h)
          </h2>
          {overview?.highVolumeSenders?.length ? (
            <div className="space-y-2">
              {overview.highVolumeSenders.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium dark:text-white">{s.fromAddress}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{s.clientName} &middot; {s.domainName}</p>
                  </div>
                  <span className={`text-sm font-bold ${s.sent > 200 ? "text-red-600" : s.sent > 50 ? "text-amber-600" : "text-gray-600 dark:text-slate-400"}`}>{s.sent}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500">No outbound activity in last 24h</p>
          )}
        </div>

        {/* Bounced senders */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-3 dark:text-white flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" /> Bounced Emails (24h)
          </h2>
          {overview?.bouncedSenders?.length ? (
            <div className="space-y-2">
              {overview.bouncedSenders.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium dark:text-white">{s.fromAddress}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{s.domainName}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600">{s.count} bounced</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500">No bounced emails in last 24h</p>
          )}
        </div>
      </div>

      {/* Outbound by client */}
      {overview?.outboundByClient?.length ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-5 mt-6">
          <h2 className="text-lg font-semibold mb-3 dark:text-white">Outbound Volume by Client (24h)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
                <th className="pb-2">Client</th><th className="pb-2">Domain</th><th className="pb-2 text-right">Sent</th>
              </tr></thead>
              <tbody>
                {overview.outboundByClient.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-slate-700/50">
                    <td className="py-2 dark:text-white">{r.clientName}</td>
                    <td className="py-2 text-gray-500 dark:text-slate-400">{r.domainName}</td>
                    <td className="py-2 text-right font-medium dark:text-white">{r.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatBox({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  const colorClass = color === "red" ? "text-red-600" : color === "amber" ? "text-amber-600" : "text-gray-900 dark:text-white";
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
        <span className="text-gray-400 dark:text-slate-500">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}
