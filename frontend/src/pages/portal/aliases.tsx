import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { portalApi } from "../../api/portal";
import { type Domain } from "../../api/domains";
import { DataTable } from "../../components/data-table";

interface Alias {
  id: string;
  sourceLocal: string;
  domainName: string;
  destination: string;
  status: string;
  createdAt: string;
}

export function PortalAliasesPage() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sourceLocal: "", destination: "" });

  const { data: domains = [] } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ["portal-aliases", selectedDomain],
    queryFn: () => portalApi.get(`domains/${selectedDomain}/aliases`).json<Alias[]>(),
    enabled: !!selectedDomain,
  });

  const createMutation = useMutation({
    mutationFn: () => portalApi.post(`domains/${selectedDomain}/aliases`, { json: form }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-aliases"] });
      setForm({ sourceLocal: "", destination: "" });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.delete(`aliases/${id}`).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-aliases"] }),
  });

  const columns = [
    { key: "source", header: "Alias", render: (a: Alias) => <span className="font-medium">{a.sourceLocal}@{a.domainName}</span> },
    { key: "dest", header: "Forwards To", render: (a: Alias) => <span className="text-sm text-slate-600">{a.destination}</span> },
    {
      key: "actions", header: "", render: (a: Alias) => (
        <button onClick={() => { if (confirm(`Delete alias ${a.sourceLocal}?`)) deleteMutation.mutate(a.id); }}
          className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Aliases</h1>
        {selectedDomain && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
            <Plus size={16} /> Create Alias
          </button>
        )}
      </div>

      <div className="mb-4">
        <label className="text-sm text-slate-600 mr-2">Domain:</label>
        <select value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm">
          <option value="">Select domain</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.domainName}</option>)}
        </select>
      </div>

      {showForm && selectedDomain && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="alias name (e.g. sales)" value={form.sourceLocal}
              onChange={(e) => setForm({ ...form, sourceLocal: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <input placeholder="forward to (e.g. john@example.com)" value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!form.sourceLocal || !form.destination || createMutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Alias"}
          </button>
        </div>
      )}

      {!selectedDomain ? (
        <div className="text-slate-400 text-center py-12">Select a domain to view aliases</div>
      ) : (
        <DataTable columns={columns} data={aliases} keyExtractor={(a) => a.id} emptyMessage="No aliases yet." />
      )}
    </div>
  );
}
