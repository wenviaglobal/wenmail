import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Shield, Plus, Trash2, Unlock, Globe, Mail, Server, RefreshCw } from "lucide-react";
import { api } from "../../api/client";

interface BannedIP { jail: string; ip: string; }
interface BlockEntry { id: string; type: string; value: string; reason: string | null; permanent: boolean; expiresAt: string | null; createdAt: string; }

export function BansPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "email" as "ip" | "email" | "domain", value: "", reason: "", permanent: true });
  const [banIp, setBanIp] = useState("");

  const { data: f2b, refetch: refetchF2b } = useQuery({
    queryKey: ["bans-f2b"],
    queryFn: () => api.get("admin/bans/fail2ban").json<{ banned: BannedIP[]; total: number }>(),
  });

  const { data: blocklistData, refetch: refetchBl } = useQuery({
    queryKey: ["bans-blocklist"],
    queryFn: () => api.get("admin/bans/blocklist").json<BlockEntry[]>(),
  });

  const unbanMut = useMutation({
    mutationFn: (d: { ip: string; jail: string }) => api.post("admin/bans/fail2ban/unban", { json: d }).json(),
    onSuccess: () => refetchF2b(),
  });

  const manualBanMut = useMutation({
    mutationFn: (ip: string) => api.post("admin/bans/fail2ban/ban", { json: { ip, jail: "postfix" } }).json(),
    onSuccess: () => { refetchF2b(); setBanIp(""); },
  });

  const addBlockMut = useMutation({
    mutationFn: (d: typeof form) => api.post("admin/bans/blocklist", { json: d }).json(),
    onSuccess: () => { refetchBl(); setShowAdd(false); setForm({ type: "email", value: "", reason: "", permanent: true }); },
  });

  const removeBlockMut = useMutation({
    mutationFn: (id: string) => api.delete(`admin/bans/${id}`).json(),
    onSuccess: () => refetchBl(),
  });

  const typeIcon = { ip: <Server size={14} />, email: <Mail size={14} />, domain: <Globe size={14} /> };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Ban size={24} className="text-red-500" />
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Ban Management</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Manage blocked IPs, emails, and domains</p>
          </div>
        </div>
        <button onClick={() => { refetchF2b(); refetchBl(); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fail2ban — Banned IPs */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Shield size={18} className="text-amber-500" /> Fail2ban Banned IPs</h2>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{f2b?.total ?? 0} banned</span>
          </div>

          {/* Manual IP ban */}
          <form onSubmit={e => { e.preventDefault(); if (banIp.trim()) manualBanMut.mutate(banIp.trim()); }} className="flex gap-2 mb-4">
            <input value={banIp} onChange={e => setBanIp(e.target.value)} placeholder="Ban IP address..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <button type="submit" disabled={!banIp.trim()} className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
              <Ban size={14} /> Ban
            </button>
          </form>

          {f2b?.banned?.length ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {f2b.banned.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-red-50 border border-red-100 rounded-lg">
                  <div>
                    <p className="font-mono text-sm font-medium">{b.ip}</p>
                    <p className="text-xs text-gray-500">Jail: {b.jail}</p>
                  </div>
                  <button onClick={() => unbanMut.mutate({ ip: b.ip, jail: b.jail })}
                    className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                    <Unlock size={12} /> Unban
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No IPs currently banned</p>
          )}
        </div>

        {/* Custom Blocklist */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Ban size={18} className="text-red-500" /> Custom Blocklist</h2>
            <button onClick={() => setShowAdd(!showAdd)}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 flex items-center gap-1">
              <Plus size={14} /> Add Block
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <form onSubmit={e => { e.preventDefault(); addBlockMut.mutate(form); }} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <div className="flex gap-2">
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="email">Email</option>
                  <option value="domain">Domain</option>
                  <option value="ip">IP Address</option>
                </select>
                <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === "ip" ? "192.168.1.1" : form.type === "email" ? "spammer@example.com" : "spamdomain.com"}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason (optional)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.permanent} onChange={e => setForm({ ...form, permanent: e.target.checked })} />
                  Permanent ban
                </label>
                <button type="submit" disabled={!form.value.trim()}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  Block
                </button>
              </div>
            </form>
          )}

          {blocklistData?.length ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {blocklistData.map(entry => (
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    {typeIcon[entry.type as keyof typeof typeIcon] || <Ban size={14} />}
                    <div>
                      <p className="font-mono text-sm font-medium">{entry.value}</p>
                      <p className="text-xs text-gray-500">
                        {entry.type} &middot; {entry.permanent ? "permanent" : entry.expiresAt ? `expires ${new Date(entry.expiresAt).toLocaleDateString()}` : "temporary"}
                        {entry.reason && ` — ${entry.reason}`}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm(`Unblock ${entry.value}?`)) removeBlockMut.mutate(entry.id); }}
                    className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1">
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No custom blocks</p>
          )}
        </div>
      </div>
    </div>
  );
}
