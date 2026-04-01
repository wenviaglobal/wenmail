import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

interface Alias {
  id: string;
  sourceLocal: string;
  domainName: string;
  destination: string;
  status: string;
  createdAt: string;
}

export function AliasListPage() {
  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ["all-aliases"],
    queryFn: async () => {
      const clients = await api.get("clients").json<Array<{ id: string }>>();
      const allDomains: Array<{ id: string }> = [];
      for (const client of clients) {
        const d = await api.get(`clients/${client.id}/domains`).json<Array<{ id: string }>>();
        allDomains.push(...d);
      }
      const allAliases: Alias[] = [];
      for (const domain of allDomains) {
        const a = await api.get(`domains/${domain.id}/aliases`).json<Alias[]>();
        allAliases.push(...a);
      }
      return allAliases;
    },
  });

  const columns = [
    {
      key: "source",
      header: "Alias",
      render: (a: Alias) => (
        <span className="font-medium">{a.sourceLocal}@{a.domainName}</span>
      ),
    },
    {
      key: "destination",
      header: "Forwards To",
      render: (a: Alias) => <span className="text-sm text-gray-600">{a.destination}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (a: Alias) => (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          {a.status}
        </span>
      ),
    },
    { key: "created", header: "Created", render: (a: Alias) => formatDate(a.createdAt) },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Aliases</h1>
      <DataTable columns={columns} data={aliases} keyExtractor={(a) => a.id} />
    </div>
  );
}
