import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, SkipForward, Eye, EyeOff } from "lucide-react";
import { portalApi } from "../../api/portal";
import { type Domain } from "../../api/domains";
import { type Mailbox } from "../../api/mailboxes";

export function PortalMigrationPage() {
  const [tab, setTab] = useState<"csv" | "imap" | "export">("csv");

  const tabs = [
    { id: "csv" as const, label: "Bulk Create (CSV)", icon: FileSpreadsheet },
    { id: "imap" as const, label: "Migrate Mailbox", icon: Upload },
    { id: "export" as const, label: "Export", icon: Download },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Import / Export</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Bulk create mailboxes, import from old provider, or export your data.</p>

      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-slate-700">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t.id ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "csv" && <CsvImport />}
      {tab === "imap" && <ImapImport />}
      {tab === "export" && <ExportInfo />}
    </div>
  );
}

function CsvImport() {
  const [selectedDomain, setSelectedDomain] = useState("");
  const [csvText, setCsvText] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: domains = [] } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  async function handleUpload() {
    setLoading(true); setError(""); setResults(null);
    try {
      const res = await portalApi.post("import/csv", { json: { domainId: selectedDomain, csvData: csvText } }).json<any>();
      setResults(res);
    } catch (err: any) {
      try { const b = await err?.response?.json(); setError(b?.message || "Import failed"); } catch { setError("Import failed"); }
    }
    setLoading(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
        <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">How it works</h3>
        <ol className="text-sm text-indigo-700 dark:text-indigo-400 space-y-1 list-decimal list-inside">
          <li>Download the CSV template or create your own</li>
          <li>Fill in: local_part, display_name, password, quota_mb</li>
          <li>Upload the CSV — mailboxes are created instantly</li>
        </ol>
        <a href="/api/client-portal/import/csv-template" className="inline-flex items-center gap-1 mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
          <Download size={14} /> Download CSV Template
        </a>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Domain</label>
          <select value={selectedDomain} onChange={e => setSelectedDomain(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full max-w-sm">
            <option value="">Select domain</option>
            {domains.filter(d => d.status === "active").map(d => <option key={d.id} value={d.id}>{d.domainName}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">CSV Data</label>
          <div className="mb-2"><input type="file" accept=".csv" onChange={handleFileUpload} className="text-sm" /></div>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8}
            placeholder={"local_part,display_name,password,quota_mb\njohn,John Smith,SecurePass@123,500\njane,Jane Doe,AnotherPass@456,500"}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-mono" />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}

        <button onClick={handleUpload} disabled={!selectedDomain || !csvText.trim() || loading}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
          <Upload size={16} /> {loading ? "Importing..." : "Import Mailboxes"}
        </button>
      </div>

      {results && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
          <h3 className="font-semibold mb-3">Import Results</h3>
          <div className="flex gap-4 mb-4 text-sm">
            <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> {results.summary.created} created</span>
            <span className="text-yellow-600 flex items-center gap-1"><SkipForward size={14} /> {results.summary.skipped} skipped</span>
            <span className="text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {results.summary.failed} failed</span>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {results.results.map((r: any, i: number) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded text-sm ${r.status === "created" ? "bg-green-50 dark:bg-green-900/10" : r.status === "skipped" ? "bg-yellow-50 dark:bg-yellow-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                <span className="font-mono">{r.localPart}</span>
                <span className={`text-xs ${r.status === "created" ? "text-green-600" : r.status === "skipped" ? "text-yellow-600" : "text-red-600"}`}>
                  {r.status}{r.error ? ` — ${r.error}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImapImport() {
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedMailbox, setSelectedMailbox] = useState("");
  const [form, setForm] = useState({ sourceHost: "", sourcePort: "993", sourceUser: "", sourcePassword: "", destPassword: "", sourceSsl: true });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: domains = [] } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  const { data: mailboxes = [] } = useQuery({
    queryKey: ["portal-mailboxes-import", selectedDomain],
    queryFn: () => portalApi.get(`domains/${selectedDomain}/mailboxes`).json<Mailbox[]>(),
    enabled: !!selectedDomain,
  });

  async function handleImport() {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await portalApi.post("import/imap", {
        json: { mailboxId: selectedMailbox, sourceHost: form.sourceHost, sourcePort: parseInt(form.sourcePort), sourceUser: form.sourceUser, sourcePassword: form.sourcePassword, destPassword: form.destPassword, sourceSsl: form.sourceSsl },
      }).json<{ message: string }>();
      setResult(res.message);
    } catch (err: any) {
      try { const b = await err?.response?.json(); setError(b?.message || "Import failed"); } catch { setError("Import failed"); }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
        <h3 className="font-semibold text-amber-900 dark:text-amber-300 mb-2">Migrate your entire mailbox from old provider</h3>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Copies <strong>ALL</strong> emails, folders, and attachments from your old mailbox to WenMail in one go.
          Your old emails are NOT deleted — they're copied. One submission per mailbox.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
          This may take 10-30 minutes depending on mailbox size. Gmail users: Use an "App Password" (Settings → Security → App Passwords).
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Domain</label>
            <select value={selectedDomain} onChange={e => { setSelectedDomain(e.target.value); setSelectedMailbox(""); }}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full">
              <option value="">Select domain</option>
              {domains.filter(d => d.status === "active").map(d => <option key={d.id} value={d.id}>{d.domainName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Import Into Mailbox</label>
            <select value={selectedMailbox} onChange={e => setSelectedMailbox(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full">
              <option value="">Select mailbox</option>
              {mailboxes.map(m => <option key={m.id} value={m.id}>{m.localPart}@{m.domainName}</option>)}
            </select>
          </div>
        </div>

        <h4 className="text-sm font-semibold pt-2 border-t border-gray-100 dark:border-slate-700">Old Email Provider</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">IMAP Server</label>
            <input value={form.sourceHost} onChange={e => setForm({ ...form, sourceHost: e.target.value })} placeholder="imap.gmail.com"
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Port</label>
            <input value={form.sourcePort} onChange={e => setForm({ ...form, sourcePort: e.target.value })} placeholder="993"
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.sourceSsl} onChange={e => setForm({ ...form, sourceSsl: e.target.checked })} /> SSL/TLS
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Old Email Address</label>
            <input value={form.sourceUser} onChange={e => setForm({ ...form, sourceUser: e.target.value })} placeholder="john@oldprovider.com"
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Old Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={form.sourcePassword} onChange={e => setForm({ ...form, sourcePassword: e.target.value })} placeholder="Old account password"
                className="px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Your WenMail Password (for this mailbox)</label>
          <input type="password" value={form.destPassword} onChange={e => setForm({ ...form, destPassword: e.target.value })} placeholder="Your WenMail mailbox password"
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm w-full max-w-sm" />
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}
        {result && <div className="text-green-700 text-sm bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={16} /> {result}</div>}

        <button onClick={handleImport}
          disabled={!selectedMailbox || !form.sourceHost || !form.sourceUser || !form.sourcePassword || !form.destPassword || loading}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
          <Upload size={16} /> {loading ? "Starting Migration..." : "Start Migration"}
        </button>
      </div>
    </div>
  );
}

function ExportInfo() {
  const { data } = useQuery({
    queryKey: ["export-info"],
    queryFn: () => portalApi.get("export/info").json<any>(),
  });

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Your data belongs to you</h3>
        <p className="text-sm text-blue-700 dark:text-blue-400">
          You can export all your emails at any time. No vendor lock-in.
        </p>
      </div>

      {data?.methods?.map((method: any, i: number) => (
        <div key={i} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2"><Download size={16} className="text-indigo-500" /> {method.name}</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">{method.description}</p>
          <ol className="text-sm text-gray-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside">
            {method.instructions?.map((step: string, j: number) => <li key={j}>{step}</li>)}
          </ol>
        </div>
      ))}

      {data?.note && <p className="text-sm text-gray-500 dark:text-slate-400 italic">{data.note}</p>}
    </div>
  );
}
