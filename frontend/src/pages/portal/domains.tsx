import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Plus, RefreshCw, BookOpen, MailPlus } from "lucide-react";
import { portalApi } from "../../api/portal";
import { type Domain, type DnsCheckResult } from "../../api/domains";
import { DataTable } from "../../components/data-table";
import { DnsStatusBadge } from "../../components/dns-status-badge";
import { formatDate } from "../../lib/utils";

export function PortalDomainsPage() {
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  const createMutation = useMutation({
    mutationFn: (domainName: string) =>
      portalApi.post("domains", { json: { domainName } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-domains"] });
      setNewDomain("");
      setShowForm(false);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => portalApi.post(`domains/${id}/verify`).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-domains"] }),
  });

  const columns = [
    { key: "domain", header: "Domain", render: (d: Domain) => <span className="font-medium">{d.domainName}</span> },
    {
      key: "dns", header: "DNS Status", render: (d: Domain) => (
        <div className="flex gap-1 flex-wrap">
          <DnsStatusBadge label="MX" configured={d.mxConfigured} />
          <DnsStatusBadge label="SPF" configured={d.spfConfigured} />
          <DnsStatusBadge label="DKIM" configured={d.dkimConfigured} />
          <DnsStatusBadge label="DMARC" configured={d.dmarcConfigured} />
        </div>
      ),
    },
    {
      key: "status", header: "Status", render: (d: Domain) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          d.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
        }`}>{d.status}</span>
      ),
    },
    {
      key: "actions", header: "Actions", render: (d: Domain) => (
        <div className="flex items-center gap-3">
          <Link to={`/portal/domains/${d.id}/dns-setup`}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
            <BookOpen size={12} /> DNS Config
          </Link>
          <button onClick={() => verifyMutation.mutate(d.id)}
            disabled={verifyMutation.isPending}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={12} className={verifyMutation.isPending && verifyMutation.variables === d.id ? "animate-spin" : ""} />
            {verifyMutation.isPending && verifyMutation.variables === d.id ? "Verifying..." : "Verify"}
          </button>
          <button onClick={async () => {
            const forwardTo = prompt("Catch-all: Forward unmatched emails to (email address):");
            if (forwardTo) {
              await portalApi.put(`catch-all/${d.id}`, { json: { enabled: true, forwardTo } }).json();
              alert("Catch-all enabled!");
            }
          }} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
            <MailPlus size={12} /> Catch-all
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Domains</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700">
          <Plus size={16} /> Add Domain
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <input type="text" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <button onClick={() => createMutation.mutate(newDomain)} disabled={!newDomain || createMutation.isPending}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
              {createMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-red-500 text-xs mt-2">Failed to add domain. Check the name and try again.</p>
          )}
        </div>
      )}

      <DataTable columns={columns} data={domains} keyExtractor={(d) => d.id} emptyMessage="No domains yet. Add your first domain." />
    </div>
  );
}
