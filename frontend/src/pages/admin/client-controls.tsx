import { useState } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api/admin";
import { clientsApi } from "../../api/clients";
import { Shield, CreditCard, Users, Settings } from "lucide-react";

export function ClientControlsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["clients", id],
    queryFn: () => clientsApi.get(id!),
    enabled: !!id,
  });

  const { data: billing } = useQuery({
    queryKey: ["client-billing", id],
    queryFn: () => adminApi.getClientBilling(id!),
    enabled: !!id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["client-users", id],
    queryFn: () => adminApi.getClientUsers(id!),
    enabled: !!id,
  });

  const [controls, setControls] = useState({
    status: "",
    billingStatus: "",
    maxMailboxOverride: "",
    maxDomainOverride: "",
  });

  const controlMutation = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = {};
      if (controls.status) data.status = controls.status;
      if (controls.billingStatus) data.billingStatus = controls.billingStatus;
      if (controls.maxMailboxOverride) data.maxMailboxOverride = parseInt(controls.maxMailboxOverride) || null;
      if (controls.maxDomainOverride) data.maxDomainOverride = parseInt(controls.maxDomainOverride) || null;
      return adminApi.updateClientControls(id!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients", id] });
      queryClient.invalidateQueries({ queryKey: ["client-billing", id] });
    },
  });

  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "owner" });
  const createUserMutation = useMutation({
    mutationFn: () => adminApi.createClientUser({ clientId: id!, ...newUser }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", id] });
      setNewUser({ email: "", password: "", name: "", role: "owner" });
    },
  });

  const billingData = billing as any;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Client Controls — {client?.name ?? "..."}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Service Controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4"><Shield size={18} className="text-gray-500" /><h2 className="font-semibold">Service Controls</h2></div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Service Status</label>
              <select value={controls.status || (client as any)?.status || ""} onChange={(e) => setControls({ ...controls, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1">
                <option value="">No change</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Billing Status</label>
              <select value={controls.billingStatus} onChange={(e) => setControls({ ...controls, billingStatus: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1">
                <option value="">No change</option>
                <option value="active">Active</option>
                <option value="overdue">Overdue</option>
                <option value="suspended">Suspended</option>
                <option value="trial">Trial</option>
              </select>
            </div>
          </div>
        </div>

        {/* Limit Overrides */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4"><Settings size={18} className="text-gray-500" /><h2 className="font-semibold">Limit Overrides</h2></div>
          <p className="text-xs text-gray-400 mb-3">Leave empty to use plan defaults. Set a number to override.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Max Mailboxes (plan: {(client as any)?.plan?.maxMailboxes ?? "?"})</label>
              <input type="number" value={controls.maxMailboxOverride} onChange={(e) => setControls({ ...controls, maxMailboxOverride: e.target.value })}
                placeholder="Use plan default" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Max Domains (plan: {(client as any)?.plan?.maxDomains ?? "?"})</label>
              <input type="number" value={controls.maxDomainOverride} onChange={(e) => setControls({ ...controls, maxDomainOverride: e.target.value })}
                placeholder="Use plan default" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1" />
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => controlMutation.mutate()} disabled={controlMutation.isPending}
        className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
        {controlMutation.isPending ? "Saving..." : "Save Controls"}
      </button>
      {controlMutation.isSuccess && <span className="text-green-600 text-sm ml-3">Saved!</span>}

      {/* Billing Summary */}
      {billingData && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
          <div className="flex items-center gap-2 mb-4"><CreditCard size={18} className="text-gray-500" /><h2 className="font-semibold">Billing Summary</h2></div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total Billed</span>
              <p className="text-lg font-bold">${billingData.billing?.totalBilled?.toFixed(2) ?? "0.00"}</p>
            </div>
            <div>
              <span className="text-gray-500">Total Paid</span>
              <p className="text-lg font-bold text-green-600">${billingData.billing?.totalPaid?.toFixed(2) ?? "0.00"}</p>
            </div>
            <div>
              <span className="text-gray-500">Outstanding</span>
              <p className="text-lg font-bold text-red-600">${billingData.billing?.outstanding?.toFixed(2) ?? "0.00"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Portal Users */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
        <div className="flex items-center gap-2 mb-4"><Users size={18} className="text-gray-500" /><h2 className="font-semibold">Portal Users</h2></div>

        {(users as any[]).length > 0 ? (
          <div className="space-y-2 mb-4">
            {(users as any[]).map((u: any) => (
              <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded p-2 text-sm">
                <div>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-gray-400 ml-2">{u.email}</span>
                </div>
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{u.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-4">No portal users. Create one so the client can log in.</p>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-2">Create Portal User</h3>
          <div className="grid grid-cols-4 gap-2">
            <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <input type="password" placeholder="Password" value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <button onClick={() => createUserMutation.mutate()} disabled={!newUser.name || !newUser.email || !newUser.password}
              className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
