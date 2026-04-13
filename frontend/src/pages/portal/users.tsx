import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Eye, EyeOff } from "lucide-react";
import { portalApi } from "../../api/portal";

interface PortalUser { id: string; email: string; name: string; role: string; status: string; lastLoginAt: string | null; }

export function PortalUsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "manager" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["portal-users"],
    queryFn: () => portalApi.get("users").json<PortalUser[]>(),
  });

  const createMutation = useMutation({
    mutationFn: () => portalApi.post("users", { json: form }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-users"] });
      setForm({ email: "", name: "", password: "", role: "manager" });
      setShowForm(false); setError("");
    },
    onError: async (err: any) => {
      try { const b = await err?.response?.json(); setError(b?.message || "Failed"); } catch { setError("Failed to create user"); }
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users size={24} className="text-indigo-500" /> Team Members</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Manage who can access your organization's portal</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          <Plus size={16} /> Add Member
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full Name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@company.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg text-sm" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm">
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}
          <button type="button" onClick={() => createMutation.mutate()} disabled={!form.email || !form.name || form.password.length < 8 || createMutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
            {createMutation.isPending ? "Creating..." : "Create Member"}
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-gray-400">Loading...</div> : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No team members yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "owner" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-700"}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
