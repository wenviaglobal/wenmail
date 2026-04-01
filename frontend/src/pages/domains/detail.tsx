import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { domainsApi, type DnsCheckResult } from "../../api/domains";
import { mailboxesApi, type Mailbox } from "../../api/mailboxes";
import { DnsStatusBadge } from "../../components/dns-status-badge";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";

export function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: dnsStatus = [], isLoading } = useQuery({
    queryKey: ["dns-status", id],
    queryFn: () => domainsApi.dnsStatus(id!),
    enabled: !!id,
  });

  const { data: domainMailboxes = [] } = useQuery({
    queryKey: ["mailboxes", id],
    queryFn: () => mailboxesApi.list(id!),
    enabled: !!id,
  });

  const verifyMutation = useMutation({
    mutationFn: () => domainsApi.verify(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dns-status", id] });
    },
  });

  const mailboxColumns = [
    {
      key: "email",
      header: "Email",
      render: (m: Mailbox) => (
        <span className="font-medium">{m.localPart}@{m.domainName}</span>
      ),
    },
    { key: "name", header: "Name", render: (m: Mailbox) => m.displayName ?? "-" },
    {
      key: "quota",
      header: "Storage",
      render: (m: Mailbox) => (
        <QuotaBar used={m.storageUsedMb} total={m.quotaMb} />
      ),
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
  ];

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Domain Details</h1>
        <button
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={verifyMutation.isPending ? "animate-spin" : ""} />
          Verify DNS
        </button>
      </div>

      {/* DNS Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {(["verify", "mx", "spf", "dkim", "dmarc"] as const).map((type) => {
          const check = dnsStatus.find((c: DnsCheckResult) => c.type === type);
          return (
            <div
              key={type}
              className={`p-4 rounded-lg border ${
                check?.pass ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
              }`}
            >
              <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                {type}
              </div>
              <div className={`text-sm font-bold ${check?.pass ? "text-green-700" : "text-red-700"}`}>
                {check?.pass ? "PASS" : "FAIL"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mailboxes */}
      <h2 className="text-lg font-semibold mb-4">Mailboxes</h2>
      <DataTable
        columns={mailboxColumns}
        data={domainMailboxes}
        keyExtractor={(m) => m.id}
        emptyMessage="No mailboxes created yet."
      />
    </div>
  );
}
