import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { type Domain } from "../../api/domains";
import { DataTable } from "../../components/data-table";
import { DnsStatusBadge } from "../../components/dns-status-badge";
import { formatDate } from "../../lib/utils";
import { Link } from "react-router";

export function DomainListPage() {
  // Fetch all clients then all their domains
  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["all-domains"],
    queryFn: async () => {
      const clients = await api.get("clients").json<Array<{ id: string }>>();
      const allDomains: Domain[] = [];
      for (const client of clients) {
        const d = await api.get(`clients/${client.id}/domains`).json<Domain[]>();
        allDomains.push(...d);
      }
      return allDomains;
    },
  });

  const columns = [
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
      header: "DNS Records",
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
      key: "verified",
      header: "Verified",
      render: (d: Domain) => (
        <span className={d.verified ? "text-green-600" : "text-gray-400"}>
          {d.verified ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d: Domain) => (
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            d.status === "active"
              ? "bg-green-100 text-green-700"
              : d.status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {d.status}
        </span>
      ),
    },
    { key: "created", header: "Added", render: (d: Domain) => formatDate(d.createdAt) },
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">All Domains</h1>
      <DataTable columns={columns} data={domains} keyExtractor={(d) => d.id} />
    </div>
  );
}
