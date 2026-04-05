import { useQuery } from "@tanstack/react-query";
import { adminApi, type ServerHealth } from "../../api/admin";
import { Activity, Database, HardDrive, Server, Cpu, MemoryStick } from "lucide-react";
import { cn } from "../../lib/utils";

function StatusDot({ status }: { status: string }) {
  const color = status === "healthy" || status === "running" ? "bg-green-500" : status === "stopped" ? "bg-red-500" : "bg-yellow-500";
  return <span className={cn("inline-block w-2 h-2 rounded-full", color)} />;
}

export function ServerHealthPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["server-health"],
    queryFn: adminApi.serverHealth,
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  if (isLoading) return <div className="text-gray-400">Loading server health...</div>;
  if (!data) return <div className="text-red-500">Failed to load health data</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Server Health</h1>
        <span className="text-xs text-gray-400">Auto-refreshes every 30s</span>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Cpu size={18} /> CPU</div>
          <p className="text-sm text-gray-600">{data.system.cpu.model}</p>
          <p className="text-2xl font-bold mt-1">{data.system.cpu.cores} cores</p>
          <p className="text-xs text-gray-400 mt-1">
            Load: {data.system.cpu.loadAvg.map((l) => l.toFixed(2)).join(" / ")} (1m/5m/15m)
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><MemoryStick size={18} /> Memory</div>
          <p className="text-2xl font-bold">{data.system.memory.usedGb} / {data.system.memory.totalGb} GB</p>
          <div className="w-full h-3 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div
              className={cn("h-full rounded-full", data.system.memory.usedPercent > 90 ? "bg-red-500" : data.system.memory.usedPercent > 70 ? "bg-yellow-500" : "bg-blue-500")}
              style={{ width: `${data.system.memory.usedPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{data.system.memory.usedPercent}% used</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Server size={18} /> System</div>
          <p className="text-sm text-gray-600">{data.system.hostname}</p>
          <p className="text-xs text-gray-400 mt-1">{data.system.platform} / {data.system.arch}</p>
          <p className="text-xs text-gray-400">Node {data.system.nodeVersion}</p>
          <p className="text-xs text-gray-400">Uptime: {Math.floor(data.system.uptime / 3600)}h {Math.floor((data.system.uptime % 3600) / 60)}m</p>
        </div>
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Database size={18} /> PostgreSQL</div>
          <div className="flex items-center gap-2">
            <StatusDot status={data.database.status} />
            <span className="text-sm font-medium capitalize">{data.database.status}</span>
          </div>
          {data.database.status === "healthy" && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <p>Latency: {data.database.latencyMs}ms</p>
              <p>DB Size: {data.database.sizeGb} GB</p>
              <p>Active connections: {data.database.activeConnections}</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-500"><Activity size={18} /> Redis</div>
          <div className="flex items-center gap-2">
            <StatusDot status={data.redis.status} />
            <span className="text-sm font-medium capitalize">{data.redis.status}</span>
          </div>
          {data.redis.status === "healthy" && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <p>Latency: {data.redis.latencyMs}ms</p>
              <p>Memory: {data.redis.usedMemory}</p>
              <p>Keys: {data.redis.totalKeys}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mail Services */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">Mail Services</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(data.mail).map(([name, info]) => (
            <div key={name} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={info.status} />
                <span className="text-sm font-medium capitalize">{name}</span>
              </div>
              <p className="text-xs text-gray-400">{info.details}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disk */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3 text-gray-500"><HardDrive size={18} /> Disk Usage</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 border-b">
              <tr>
                <th className="text-left py-2">Filesystem</th>
                <th className="text-left py-2">Size</th>
                <th className="text-left py-2">Used</th>
                <th className="text-left py-2">Available</th>
                <th className="text-left py-2">Use%</th>
                <th className="text-left py-2">Mount</th>
              </tr>
            </thead>
            <tbody>
              {data.disk.map((d, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 font-mono text-xs">{d.filesystem}</td>
                  <td className="py-2">{d.size}</td>
                  <td className="py-2">{d.used}</td>
                  <td className="py-2">{d.available}</td>
                  <td className="py-2">
                    <span className={cn("font-medium",
                      parseInt(d.usePercent) > 90 ? "text-red-600" : parseInt(d.usePercent) > 70 ? "text-yellow-600" : "text-green-600"
                    )}>{d.usePercent}</span>
                  </td>
                  <td className="py-2 font-mono text-xs">{d.mountedOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & Spam */}
      {(data as any).security && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Activity size={20} /> Spam Filter (Rspamd)</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              {Object.entries((data as any).security.rspamd || {}).map(([key, val]) => (
                <div key={key}>
                  <span className="text-gray-500 capitalize">{key}</span>
                  <p className="font-semibold text-lg">{val as string}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fail2ban */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold mb-2">Fail2ban</h3>
              <p className="text-sm text-gray-500">Jails: {((data as any).security.fail2ban?.jails || []).join(", ") || "none"}</p>
              <p className="text-2xl font-bold mt-1">
                <span className={(data as any).security.fail2ban?.totalBanned > 0 ? "text-amber-600" : "text-green-600"}>
                  {(data as any).security.fail2ban?.totalBanned ?? 0}
                </span>
                <span className="text-sm text-gray-400 ml-1">banned IPs</span>
              </p>
            </div>

            {/* IMAP Connections */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold mb-2">IMAP Connections</h3>
              <p className="text-2xl font-bold">{(data as any).security.imapConnections ?? 0}</p>
              <p className="text-sm text-gray-400">active sessions</p>
            </div>

            {/* SSL Certs */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <h3 className="font-semibold mb-2">SSL Certificates</h3>
              {((data as any).security.ssl || []).map((cert: any, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-600 truncate max-w-[140px]">{cert.domain}</span>
                  <span className={cn("font-medium",
                    cert.status === "ok" ? "text-green-600" : cert.status === "warning" ? "text-amber-600" : "text-red-600"
                  )}>{cert.daysLeft}d left</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
