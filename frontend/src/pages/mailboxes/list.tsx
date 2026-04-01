import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { type Mailbox } from "../../api/mailboxes";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";
import { formatDate } from "../../lib/utils";

export function MailboxListPage() {
  const { data: allMailboxes = [], isLoading } = useQuery({
    queryKey: ["all-mailboxes"],
    queryFn: async () => {
      const clients = await api.get("clients").json<Array<{ id: string }>>();
      const allDomains: Array<{ id: string }> = [];
      for (const client of clients) {
        const d = await api.get(`clients/${client.id}/domains`).json<Array<{ id: string }>>();
        allDomains.push(...d);
      }
      const mailboxes: Mailbox[] = [];
      for (const domain of allDomains) {
        const m = await api.get(`domains/${domain.id}/mailboxes`).json<Mailbox[]>();
        mailboxes.push(...m);
      }
      return mailboxes;
    },
  });

  const columns = [
    {
      key: "email",
      header: "Email Address",
      render: (m: Mailbox) => (
        <span className="font-medium">{m.localPart}@{m.domainName}</span>
      ),
    },
    { key: "name", header: "Display Name", render: (m: Mailbox) => m.displayName ?? "-" },
    {
      key: "storage",
      header: "Storage",
      render: (m: Mailbox) => <QuotaBar used={m.storageUsedMb} total={m.quotaMb} label="Usage" />,
    },
    {
      key: "status",
      header: "Status",
      render: (m: Mailbox) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            m.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {m.status}
        </span>
      ),
    },
    {
      key: "lastLogin",
      header: "Last Login",
      render: (m: Mailbox) => (m.lastLoginAt ? formatDate(m.lastLoginAt) : "Never"),
    },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Mailboxes</h1>
      <DataTable columns={columns} data={allMailboxes} keyExtractor={(m) => m.id} />
    </div>
  );
}
