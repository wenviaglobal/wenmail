import { useQuery } from "@tanstack/react-query";
import { Globe, Mail, ArrowRightLeft } from "lucide-react";
import { portalApi, type PortalDashboard } from "../../api/portal";
import { StatCard } from "../../components/stat-card";

export function PortalDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: () => portalApi.get("dashboard").json<PortalDashboard>(),
  });

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard title="Domains" value={data?.domains ?? 0} icon={<Globe size={24} />}
          subtitle={`Limit: ${data?.limits.maxDomains}`} />
        <StatCard title="Mailboxes" value={data?.mailboxes ?? 0} icon={<Mail size={24} />}
          subtitle={`Limit: ${data?.limits.maxMailboxes}`} />
        <StatCard title="Aliases" value={data?.aliases ?? 0} icon={<ArrowRightLeft size={24} />}
          subtitle={`Limit: ${data?.limits.maxAliases}`} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="text-lg font-semibold mb-3">Your Plan</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Plan</span>
            <p className="font-medium">{data?.plan?.name ?? "N/A"}</p>
          </div>
          <div>
            <span className="text-slate-500">Max Domains</span>
            <p className="font-medium">{data?.limits.maxDomains}</p>
          </div>
          <div>
            <span className="text-slate-500">Max Mailboxes</span>
            <p className="font-medium">{data?.limits.maxMailboxes}</p>
          </div>
          <div>
            <span className="text-slate-500">Storage / Mailbox</span>
            <p className="font-medium">{data?.limits.storagePerMailboxMb} MB</p>
          </div>
        </div>
      </div>
    </div>
  );
}
