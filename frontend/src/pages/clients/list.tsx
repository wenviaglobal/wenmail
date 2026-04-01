import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { clientsApi, type Client } from "../../api/clients";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

export function ClientListPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: clientsApi.list,
  });

  const columns = [
    {
      key: "name",
      header: "Company",
      render: (c: Client) => (
        <Link to={`/clients/${c.id}`} className="text-blue-600 hover:underline font-medium">
          {c.name}
        </Link>
      ),
    },
    { key: "slug", header: "Slug", render: (c: Client) => <code className="text-xs bg-gray-100 px-1 rounded">{c.slug}</code> },
    { key: "plan", header: "Plan", render: (c: Client) => c.plan?.name ?? "-" },
    { key: "contact", header: "Contact", render: (c: Client) => c.contactEmail },
    {
      key: "status",
      header: "Status",
      render: (c: Client) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            c.status === "active"
              ? "bg-green-100 text-green-700"
              : c.status === "suspended"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
          }`}
        >
          {c.status}
        </span>
      ),
    },
    { key: "created", header: "Created", render: (c: Client) => formatDate(c.createdAt) },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Client
        </button>
      </div>

      <DataTable
        columns={columns}
        data={clients}
        keyExtractor={(c) => c.id}
        emptyMessage="No clients yet. Add your first client to get started."
      />
    </div>
  );
}
