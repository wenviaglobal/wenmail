import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

interface MailLog {
  id: number;
  direction: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  status: string;
  sizeBytes: number;
  createdAt: string;
}

export function MailLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["mail-logs"],
    queryFn: () =>
      api
        .get("logs/mail")
        .json<{ data: MailLog[]; pagination: { total: number; pages: number } }>(),
  });

  const columns = [
    {
      key: "direction",
      header: "Dir",
      render: (l: MailLog) => (
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            l.direction === "inbound" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
          }`}
        >
          {l.direction === "inbound" ? "IN" : "OUT"}
        </span>
      ),
    },
    { key: "from", header: "From", render: (l: MailLog) => l.fromAddress },
    { key: "to", header: "To", render: (l: MailLog) => l.toAddress },
    {
      key: "subject",
      header: "Subject",
      render: (l: MailLog) => (
        <span className="truncate max-w-xs block">{l.subject ?? "-"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (l: MailLog) => (
        <span
          className={`text-xs font-medium ${
            l.status === "delivered"
              ? "text-green-600"
              : l.status === "bounced"
                ? "text-red-600"
                : "text-yellow-600"
          }`}
        >
          {l.status}
        </span>
      ),
    },
    { key: "date", header: "Date", render: (l: MailLog) => formatDate(l.createdAt) },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mail Logs</h1>
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(l) => String(l.id)} />
    </div>
  );
}
