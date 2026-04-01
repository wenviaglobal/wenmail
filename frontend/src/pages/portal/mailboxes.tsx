import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { portalApi } from "../../api/portal";
import { type Domain } from "../../api/domains";
import { type Mailbox } from "../../api/mailboxes";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";

export function PortalMailboxesPage() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ localPart: "", password: "", displayName: "" });

  const { data: domains = [] } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ["portal-mailboxes", selectedDomain],
    queryFn: () => portalApi.get(`domains/${selectedDomain}/mailboxes`).json<Mailbox[]>(),
    enabled: !!selectedDomain,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      portalApi.post(`domains/${selectedDomain}/mailboxes`, { json: form }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] });
      setForm({ localPart: "", password: "", displayName: "" });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.delete(`mailboxes/${id}`).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] }),
  });

  const columns = [
    { key: "email", header: "Email", render: (m: Mailbox) => <span className="font-medium">{m.localPart}@{m.domainName}</span> },
    { key: "name", header: "Name", render: (m: Mailbox) => m.displayName ?? "-" },
    { key: "storage", header: "Storage", render: (m: Mailbox) => <QuotaBar used={m.storageUsedMb} total={m.quotaMb} /> },
    {
      key: "status", header: "Status", render: (m: Mailbox) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          m.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}>{m.status}</span>
      ),
    },
    {
      key: "actions", header: "", render: (m: Mailbox) => (
        <button onClick={() => { if (confirm(`Disable ${m.localPart}@${m.domainName}?`)) deleteMutation.mutate(m.id); }}
          className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mailboxes</h1>
        {selectedDomain && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
            <Plus size={16} /> Create Mailbox
          </button>
        )}
      </div>

      {/* Domain selector */}
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
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="username" value={form.localPart} onChange={(e) => setForm({ ...form, localPart: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <input placeholder="Display Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <input type="password" placeholder="Password (min 8 chars)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
          </div>
          <button onClick={() => createMutation.mutate()} disabled={!form.localPart || !form.password || createMutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Mailbox"}
          </button>
        </div>
      )}

      {!selectedDomain ? (
        <div className="text-slate-400 text-center py-12">Select a domain to view mailboxes</div>
      ) : isLoading ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <DataTable columns={columns} data={mailboxes} keyExtractor={(m) => m.id} emptyMessage="No mailboxes yet." />
      )}
    </div>
  );
}
