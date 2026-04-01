import { useQuery } from "@tanstack/react-query";
import { Users, Globe, Mail, ArrowRightLeft } from "lucide-react";
import { api } from "../api/client";
import { StatCard } from "../components/stat-card";
import { formatDate } from "../lib/utils";

interface DashboardStats {
  clients: number;
  domains: number;
  mailboxes: number;
  aliases: number;
  recentActivity: Array<{
    id: number;
    direction: string;
    fromAddress: string;
    toAddress: string;
    status: string;
    createdAt: string;
  }>;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("dashboard/stats").json<DashboardStats>(),
  });

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Clients" value={data?.clients ?? 0} icon={<Users size={24} />} />
        <StatCard title="Domains" value={data?.domains ?? 0} icon={<Globe size={24} />} />
        <StatCard title="Mailboxes" value={data?.mailboxes ?? 0} icon={<Mail size={24} />} />
        <StatCard title="Aliases" value={data?.aliases ?? 0} icon={<ArrowRightLeft size={24} />} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-4">Recent Mail Activity</h2>
        {data?.recentActivity?.length === 0 ? (
          <p className="text-gray-400 text-sm">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {data?.recentActivity?.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between text-sm border-b border-gray-100 pb-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      log.direction === "inbound"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {log.direction}
                  </span>
                  <span className="text-gray-600">
                    {log.fromAddress} → {log.toAddress}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs ${
                      log.status === "delivered"
                        ? "text-green-600"
                        : log.status === "bounced"
                          ? "text-red-600"
                          : "text-yellow-600"
                    }`}
                  >
                    {log.status}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
