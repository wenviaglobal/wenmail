import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Mail, ArrowRightLeft } from "lucide-react";
import { clientsApi } from "../../api/clients";
import { domainsApi, type Domain } from "../../api/domains";
import { StatCard } from "../../components/stat-card";
import { DnsStatusBadge } from "../../components/dns-status-badge";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: client, isLoading } = useQuery({
    queryKey: ["clients", id],
    queryFn: () => clientsApi.get(id!),
    enabled: !!id,
  });

  const { data: clientDomains = [] } = useQuery({
    queryKey: ["domains", id],
    queryFn: () => domainsApi.list(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-gray-400">Loading...</div>;
  if (!client) return <div className="text-red-500">Client not found</div>;

  const domainColumns = [
    {
      key: "domain",
      header: "Domain",
      render: (d: Domain) => (
        <Link to={`/domains/${d.id}`} className="text-blue-600 hover:underline font-medium">
          {d.domainName}
        </Link>
      ),
    },
    {
      key: "dns",
      header: "DNS Status",
      render: (d: Domain) => (
        <div className="flex gap-1 flex-wrap">
          <DnsStatusBadge label="MX" configured={d.mxConfigured} />
          <DnsStatusBadge label="SPF" configured={d.spfConfigured} />
          <DnsStatusBadge label="DKIM" configured={d.dkimConfigured} />
          <DnsStatusBadge label="DMARC" configured={d.dmarcConfigured} />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d: Domain) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            d.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {d.status}
        </span>
      ),
    },
    { key: "created", header: "Added", render: (d: Domain) => formatDate(d.createdAt) },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link to="/clients" className="text-sm text-gray-500 hover:text-gray-700">
          Clients
        </Link>
        <span className="text-gray-400 mx-2">/</span>
        <span className="text-sm font-medium">{client.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-gray-500 text-sm">{client.contactEmail}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/clients/${id}/controls`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Manage Controls
          </Link>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              client.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {client.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard title="Domains" value={client.stats?.domainCount ?? 0} icon={<Globe size={20} />} />
        <StatCard title="Mailboxes" value={client.stats?.mailboxCount ?? 0} icon={<Mail size={20} />} />
        <StatCard title="Aliases" value={client.stats?.aliasCount ?? 0} icon={<ArrowRightLeft size={20} />} />
      </div>

      <h2 className="text-lg font-semibold mb-4">Domains</h2>
      <DataTable
        columns={domainColumns}
        data={clientDomains}
        keyExtractor={(d) => d.id}
        emptyMessage="No domains added yet."
      />
    </div>
  );
}
