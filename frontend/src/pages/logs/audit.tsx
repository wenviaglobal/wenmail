import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

interface AuditEntry {
  id: number;
  actorType: string;
  action: string;
  targetType: string;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () =>
      api
        .get("logs/audit")
        .json<{ data: AuditEntry[]; pagination: { total: number; pages: number } }>(),
  });

  const columns = [
    {
      key: "actor",
      header: "Actor",
      render: (e: AuditEntry) => (
        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{e.actorType}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (e: AuditEntry) => <span className="font-medium text-sm">{e.action}</span>,
    },
    { key: "target", header: "Target", render: (e: AuditEntry) => e.targetType ?? "-" },
    {
      key: "details",
      header: "Details",
      render: (e: AuditEntry) => (
        <code className="text-xs text-gray-500 truncate max-w-xs block">
          {e.details ? JSON.stringify(e.details) : "-"}
        </code>
      ),
    },
    { key: "ip", header: "IP", render: (e: AuditEntry) => e.ipAddress ?? "-" },
    { key: "date", header: "Date", render: (e: AuditEntry) => formatDate(e.createdAt) },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(e) => String(e.id)} />
    </div>
  );
}
