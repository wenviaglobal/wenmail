import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "../../api/portal";
import { ArrowLeft, Copy, CheckCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface DnsRecord {
  step: number;
  purpose: string;
  type: string;
  host: string;
  hostHint: string;
  value: string;
  priority?: number;
  required: boolean;
  note?: string;
}

interface DnsGuide {
  summary: { hostname: string; serverIp: string };
  records: DnsRecord[];
}

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

export function PortalDnsSetupPage() {
  const { id } = useParams<{ id: string }>();

  const { data: guide, isLoading } = useQuery({
    queryKey: ["dns-guide", id],
    queryFn: () => portalApi.get(`domains/${id}/dns-guide`).json<DnsGuide>(),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-slate-400">Loading DNS guide...</div>;
  if (!guide) return <div className="text-red-500">Failed to load guide</div>;

  return (
    <div className="max-w-3xl">
      <Link to="/portal/domains" className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to Domains
      </Link>

      <h1 className="text-2xl font-bold mb-2">DNS Setup Guide</h1>
      <p className="text-slate-500 mb-6">
        Add these DNS records at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.).
        DNS changes can take 5 minutes to 48 hours to propagate.
      </p>

      {/* Server info */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <h3 className="font-medium text-indigo-900 mb-2">Your Mail Server</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-indigo-600">Hostname:</span>{" "}
            <code className="bg-white px-2 py-0.5 rounded">{guide.summary.hostname}</code>
          </div>
          <div>
            <span className="text-indigo-600">IP Address:</span>{" "}
            {guide.summary.serverIp && !guide.summary.serverIp.includes("not configured") ? (
              <code className="bg-white px-2 py-0.5 rounded">{guide.summary.serverIp}</code>
            ) : (
              <span className="text-amber-600 flex items-center gap-1 inline">
                <AlertTriangle size={12} /> Not configured yet — contact admin
              </span>
            )}
          </div>
        </div>
      </div>

      {/* DNS Records */}
      <div className="space-y-4">
        {guide.records.map((rec) => (
          <div key={rec.step} className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="bg-indigo-600 text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">
                  {rec.step}
                </span>
                <div>
                  <h3 className="font-medium">{rec.purpose}</h3>
                  <span className="text-xs text-slate-400">
                    {rec.required ? "Required" : "Optional"}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono font-medium">
                {rec.type}{rec.priority ? ` (Priority: ${rec.priority})` : ""}
              </span>
            </div>

            <div className="space-y-3">
              {/* Host */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-500 font-medium">HOST / NAME</label>
                  <CopyButton text={rec.hostHint} />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono text-sm mt-1">
                  {rec.hostHint}
                </div>
                <p className="text-xs text-slate-400 mt-1">Full: <code>{rec.host}</code></p>
              </div>

              {/* Value */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-500 font-medium">VALUE</label>
                  <CopyButton text={rec.value} />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono text-xs mt-1 break-all max-h-32 overflow-y-auto">
                  {rec.value}
                </div>
              </div>

              {/* Note */}
              {rec.note && (
                <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
                  {rec.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* After adding records */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-5 mt-6">
        <h3 className="font-medium text-green-800 mb-2">After Adding All Records</h3>
        <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
          <li>Wait 5-30 minutes for DNS propagation (can take up to 48 hours)</li>
          <li>Go back to <Link to="/portal/domains" className="underline">Domains</Link> and click <strong>Verify</strong></li>
          <li>Once all badges are green, you can start creating mailboxes</li>
          <li>Configure your email client (Thunderbird, Outlook) with IMAP/SMTP settings</li>
        </ol>
      </div>
    </div>
  );
}
