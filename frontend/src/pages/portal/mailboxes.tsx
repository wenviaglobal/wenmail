import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy, CheckCircle, Monitor, Smartphone, Globe, MoreVertical, Eye, EyeOff, KeyRound, Power, PowerOff, X } from "lucide-react";
import { portalApi } from "../../api/portal";
import { type Domain } from "../../api/domains";
import { type Mailbox } from "../../api/mailboxes";
import { DataTable } from "../../components/data-table";
import { QuotaBar } from "../../components/quota-bar";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
      {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
    </button>
  );
}

interface MailSettings {
  hostname: string;
  webmailUrl: string;
  imap: { server: string; port: number; security: string };
  smtp: { server: string; port: number; security: string };
}

export function PortalMailboxesPage() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ localPart: "", password: "", displayName: "" });

  const { data: mailSettings } = useQuery({
    queryKey: ["mail-settings"],
    queryFn: () => portalApi.get("mail-settings").json<MailSettings>(),
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["portal-domains"],
    queryFn: () => portalApi.get("domains").json<Domain[]>(),
  });

  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ["portal-mailboxes", selectedDomain],
    queryFn: () => portalApi.get(`domains/${selectedDomain}/mailboxes`).json<Mailbox[]>(),
    enabled: !!selectedDomain,
  });

  const [createError, setCreateError] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: () =>
      portalApi.post(`domains/${selectedDomain}/mailboxes`, { json: form }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] });
      setForm({ localPart: "", password: "", displayName: "" });
      setShowForm(false);
      setCreateError("");
    },
    onError: async (err: unknown) => {
      try {
        const resp = err as { response?: { json: () => Promise<{ message?: string }> } };
        const body = await resp.response?.json();
        setCreateError(body?.message || "Failed to create mailbox");
      } catch {
        setCreateError("Failed to create mailbox. Check username and password (min 8 chars).");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.delete(`mailboxes/${id}`).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] }),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => portalApi.delete(`mailboxes/${id}/permanent`).json(),
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
        <MailboxActions
          mailbox={m}
          onDisable={() => deleteMutation.mutate(m.id)}
          onReEnable={() => { portalApi.put(`mailboxes/${m.id}`, { json: { status: "active" } }).json().then(() => queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] })); }}
          onDelete={() => permanentDeleteMutation.mutate(m.id)}
          onPasswordChange={(pw) => portalApi.put(`mailboxes/${m.id}`, { json: { password: pw } }).json().then(() => queryClient.invalidateQueries({ queryKey: ["portal-mailboxes"] }))}
        />
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!form.localPart || !form.password || form.password.length < 8 || createMutation.isPending) return;
            setCreateError("");
            createMutation.mutate();
          }}
          className="bg-white border border-slate-200 rounded-lg p-4 mb-6 space-y-3"
        >
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="username" value={form.localPart} onChange={(e) => setForm({ ...form, localPart: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <input placeholder="Display Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
            <input type="password" placeholder="Password (min 8 chars)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm" />
          </div>
          {createError && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{createError}</div>
          )}
          {form.password && form.password.length > 0 && form.password.length < 8 && (
            <p className="text-xs text-amber-600">Password must be at least 8 characters</p>
          )}
          <button type="submit"
            disabled={!form.localPart || !form.password || form.password.length < 8 || createMutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700 disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Mailbox"}
          </button>
        </form>
      )}

      {!selectedDomain ? (
        <div className="text-slate-400 text-center py-12">Select a domain to view mailboxes</div>
      ) : isLoading ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <DataTable columns={columns} data={mailboxes} keyExtractor={(m) => m.id} emptyMessage="No mailboxes yet." />
      )}

      {/* Email Setup Instructions */}
      {mailboxes.length > 0 && selectedDomain && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">How to Use Your Email</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Webmail */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe size={20} className="text-indigo-600" />
                <h3 className="font-semibold">Webmail (Browser)</h3>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Access your email from any browser — no app needed.
              </p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">URL</span>
                    <CopyBtn text={mailSettings?.webmailUrl || mailSettings?.hostname || ""} />
                  </div>
                  <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm mt-1">
                    {mailSettings?.webmailUrl || mailSettings?.hostname || "Loading..."}
                  </code>
                </div>
                <p className="text-xs text-slate-400">Login with your full email and password</p>
              </div>
            </div>

            {/* Desktop App */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Monitor size={20} className="text-indigo-600" />
                <h3 className="font-semibold">Desktop App</h3>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Thunderbird, Outlook, Apple Mail, etc.
              </p>
              <p className="text-xs text-slate-400">Use the IMAP/SMTP settings below</p>
            </div>

            {/* Mobile */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone size={20} className="text-indigo-600" />
                <h3 className="font-semibold">Phone / Tablet</h3>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                iPhone Mail, Gmail App, Outlook Mobile, etc.
              </p>
              <p className="text-xs text-slate-400">Use the IMAP/SMTP settings below</p>
            </div>
          </div>

          {/* IMAP/SMTP Settings */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold mb-4">IMAP / SMTP Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Incoming */}
              <div>
                <h4 className="text-sm font-medium text-indigo-700 mb-3 uppercase tracking-wide">Incoming Mail (IMAP)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Server</span>
                    <CopyBtn text={mailSettings?.imap.server || ""} />
                  </div>
                  <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm">{mailSettings?.imap.server || "Loading..."}</code>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-slate-600">Port</span>
                    <CopyBtn text={String(mailSettings?.imap.port || 993)} />
                  </div>
                  <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm">{mailSettings?.imap.port || 993}</code>

                  <div className="mt-2">
                    <span className="text-sm text-slate-600">Security</span>
                    <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm mt-1">{mailSettings?.imap.security || "SSL/TLS"}</code>
                  </div>
                </div>
              </div>

              {/* Outgoing */}
              <div>
                <h4 className="text-sm font-medium text-indigo-700 mb-3 uppercase tracking-wide">Outgoing Mail (SMTP)</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Server</span>
                    <CopyBtn text={mailSettings?.smtp.server || ""} />
                  </div>
                  <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm">{mailSettings?.smtp.server || "Loading..."}</code>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-slate-600">Port</span>
                    <CopyBtn text={String(mailSettings?.smtp.port || 587)} />
                  </div>
                  <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm">{mailSettings?.smtp.port || 587}</code>

                  <div className="mt-2">
                    <span className="text-sm text-slate-600">Security</span>
                    <code className="block bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-sm mt-1">{mailSettings?.smtp.security || "STARTTLS"}</code>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                <strong>Username:</strong> Your full email address (e.g., <code className="bg-slate-50 px-1 rounded">{mailboxes[0]?.localPart}@{mailboxes[0]?.domainName}</code>)
              </p>
              <p className="text-sm text-slate-600 mt-1">
                <strong>Password:</strong> The password you set when creating the mailbox
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAILBOX ACTIONS — popover + password modal
// ==========================================

function MailboxActions({ mailbox: m, onDisable, onReEnable, onDelete, onPasswordChange }: {
  mailbox: Mailbox;
  onDisable: () => void;
  onReEnable: () => void;
  onDelete: () => void;
  onPasswordChange: (pw: string) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition">
        <MoreVertical size={16} />
      </button>

      {open && !showPwModal && (
        <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl z-50 py-1.5 min-w-[180px] animate-in fade-in">
          {m.status === "active" ? (
            <>
              <button onClick={() => { setOpen(false); setShowPwModal(true); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2.5 transition">
                <KeyRound size={14} className="text-indigo-500" /> Change Password
              </button>
              <button onClick={() => { setOpen(false); if (confirm(`Disable ${m.localPart}@${m.domainName}?`)) onDisable(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 border-t border-gray-100 dark:border-slate-700 transition">
                <PowerOff size={14} /> Disable Mailbox
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setOpen(false); onReEnable(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2.5 transition">
                <Power size={14} /> Re-enable
              </button>
              <button onClick={() => { setOpen(false); if (confirm(`PERMANENTLY DELETE ${m.localPart}@${m.domainName}?\n\nThis will remove all emails and cannot be undone.`)) onDelete(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 border-t border-gray-100 dark:border-slate-700 transition">
                <Trash2 size={14} /> Delete Forever
              </button>
            </>
          )}
        </div>
      )}

      {showPwModal && (
        <PasswordChangeModal
          email={`${m.localPart}@${m.domainName}`}
          onClose={() => setShowPwModal(false)}
          onSave={async (pw) => { await onPasswordChange(pw); setShowPwModal(false); }}
        />
      )}
    </div>
  );
}

// ==========================================
// PASSWORD CHANGE MODAL
// ==========================================

function PasswordChangeModal({ email, onClose, onSave }: {
  email: string;
  onClose: () => void;
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password) ? 4 : 3;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"][strength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await onSave(password);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch { setError("Failed to change password"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h3 className="font-semibold dark:text-white flex items-center gap-2"><KeyRound size={16} className="text-indigo-500" /> Change Password</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1"><X size={18} /></button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <p className="font-medium dark:text-white">Password Changed</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">The user can now log in with the new password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">New Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : "bg-gray-200 dark:bg-slate-600"}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 ${strength <= 1 ? "text-red-500" : strength === 2 ? "text-yellow-600" : strength === 3 ? "text-blue-600" : "text-green-600"}`}>{strengthLabel}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Confirm Password</label>
              <input type={showPw ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none dark:bg-slate-700 dark:text-white ${confirm && confirm !== password ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-slate-600"}`} />
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {error && <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={!password || !confirm || password !== confirm || password.length < 8 || saving}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                {saving ? "Saving..." : "Update Password"}
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
