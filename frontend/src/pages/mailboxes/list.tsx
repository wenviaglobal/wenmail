import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { type Mailbox } from "../../api/mailboxes";
import { type Domain } from "../../api/domains";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";
import { formatDate } from "../../lib/utils";

interface Client {
  id: string;
  name: string;
  slug: string;
}

interface MailboxWithClient extends Mailbox {
  clientName: string;
}

export function MailboxListPage() {
  const [selectedClient, setSelectedClient] = useState<string>("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: () => api.get("clients").json<Client[]>(),
  });

  const { data: allMailboxes = [], isLoading } = useQuery({
    queryKey: ["all-mailboxes-grouped"],
    queryFn: async () => {
      const clientList = await api.get("clients").json<Client[]>();
      const result: MailboxWithClient[] = [];
      for (const client of clientList) {
        const domains = await api.get(`clients/${client.id}/domains`).json<Domain[]>();
        for (const domain of domains) {
          const mailboxes = await api.get(`domains/${domain.id}/mailboxes`).json<Mailbox[]>();
          result.push(...mailboxes.map((m) => ({ ...m, clientName: client.name })));
        }
      }
      return result;
    },
  });

  const filtered = selectedClient
    ? allMailboxes.filter((m) => {
        const client = clients.find((c) => c.id === selectedClient);
        return client && m.clientName === client.name;
      })
    : allMailboxes;

  const columns = [
    {
      key: "email",
      header: "Email Address",
      render: (m: MailboxWithClient) => (
        <span className="font-medium">{m.localPart}@{m.domainName}</span>
      ),
    },
    { key: "client", header: "Client", render: (m: MailboxWithClient) => (
      <span className="text-sm text-gray-500">{m.clientName}</span>
    )},
    { key: "name", header: "Display Name", render: (m: MailboxWithClient) => m.displayName ?? "-" },
    {
      key: "storage",
      header: "Storage",
      render: (m: MailboxWithClient) => <QuotaBar used={m.storageUsedMb} total={m.quotaMb} />,
    },
    {
      key: "status",
      header: "Status",
      render: (m: MailboxWithClient) => (
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
      render: (m: MailboxWithClient) => (m.lastLoginAt ? formatDate(m.lastLoginAt) : "Never"),
    },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">All Mailboxes</h1>
        <span className="text-sm text-gray-500">{filtered.length} mailboxes</span>
      </div>

      {/* Client filter */}
      <div className="mb-4">
        <label className="text-sm text-gray-600 mr-2">Filter by Client:</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} data={filtered} keyExtractor={(m) => m.id} emptyMessage="No mailboxes found." />
    </div>
  );
}
