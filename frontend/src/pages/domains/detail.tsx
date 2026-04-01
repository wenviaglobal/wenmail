import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Copy, CheckCircle } from "lucide-react";
import { domainsApi, type DnsCheckResult, type DnsGuide } from "../../api/domains";
import { mailboxesApi, type Mailbox } from "../../api/mailboxes";
import { DnsStatusBadge } from "../../components/dns-status-badge";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
    >
      {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
    </button>
  );
}

export function DomainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: dnsStatus = [], isLoading } = useQuery({
    queryKey: ["dns-status", id],
    queryFn: () => domainsApi.dnsStatus(id!),
    enabled: !!id,
  });

  const { data: guide } = useQuery({
    queryKey: ["dns-guide", id],
    queryFn: () => domainsApi.dnsGuide(id!),
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

      {/* DNS Setup Guide */}
      {guide && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">DNS Setup Guide</h2>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <h3 className="font-medium text-indigo-900 mb-2">Mail Server Info</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-indigo-600">Hostname:</span>{" "}
                <code className="bg-white px-2 py-0.5 rounded">{guide.summary.hostname}</code>
              </div>
              <div>
                <span className="text-indigo-600">IP:</span>{" "}
                <code className="bg-white px-2 py-0.5 rounded">{guide.summary.serverIp || "Not set"}</code>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {guide.records.map((rec) => (
              <div key={rec.step} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                    {rec.step}
                  </span>
                  <span className="font-medium text-sm">{rec.purpose}</span>
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono ml-auto">
                    {rec.type}{rec.priority ? ` (Priority: ${rec.priority})` : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      <span className="font-medium">Host:</span>{" "}
                      <code className="bg-gray-50 px-1 rounded">{rec.hostHint}</code>
                    </div>
                    <CopyButton text={rec.hostHint} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">Value:</span>
                      <CopyButton text={rec.value} />
                    </div>
                    <code className="block bg-gray-50 border border-gray-200 px-3 py-2 rounded text-xs mt-1 break-all">
                      {rec.value}
                    </code>
                  </div>
                  {rec.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
                      {rec.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
