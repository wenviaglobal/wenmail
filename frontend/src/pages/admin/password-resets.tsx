import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Check, Clock } from "lucide-react";
import { adminApi, type PasswordResetRequest } from "../../api/admin";
import { DataTable } from "../../components/data-table";

export function PasswordResetsPage() {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [notes, setNotes] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["password-resets"],
    queryFn: () => adminApi.listPasswordResets(),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, newPassword, notes }: { id: string; newPassword: string; notes?: string }) =>
      adminApi.resolvePasswordReset(id, { newPassword, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password-resets"] });
      setResolving(null);
      setNewPassword("");
      setNotes("");
    },
  });

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  if (isLoading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <KeyRound size={24} className="text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold">Password Reset Requests</h1>
          <p className="text-sm text-gray-500">
            Clients request password resets from the portal. Set a new password and inform them.
          </p>
        </div>
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Pending ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((req) => (
              <div key={req.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{req.email}</p>
                    <p className="text-sm text-gray-500">
                      {req.clientName} &middot; {new Date(req.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {resolving !== req.id ? (
                    <button
                      onClick={() => setResolving(req.id)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
                    >
                      Reset Password
                    </button>
                  ) : (
                    <button
                      onClick={() => setResolving(null)}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {resolving === req.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newPassword.length >= 8) {
                        resolveMutation.mutate({ id: req.id, newPassword, notes: notes || undefined });
                      }
                    }}
                    className="mt-4 pt-4 border-t border-amber-200 space-y-3"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                      <input
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g., Client requested via phone"
                        className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={newPassword.length < 8 || resolveMutation.isPending}
                      className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Check size={16} />
                      {resolveMutation.isPending ? "Resetting..." : "Confirm Reset"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center mb-8">
          <Check size={24} className="text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium">No pending requests</p>
          <p className="text-sm text-green-600">All password reset requests have been resolved.</p>
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">History</h2>
          <DataTable
            columns={[
              { key: "email", header: "Email", render: (r: PasswordResetRequest) => r.email },
              { key: "client", header: "Client", render: (r: PasswordResetRequest) => r.clientName },
              {
                key: "status", header: "Status", render: (r: PasswordResetRequest) => (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                  }`}>{r.status}</span>
                ),
              },
              { key: "date", header: "Requested", render: (r: PasswordResetRequest) => new Date(r.createdAt).toLocaleDateString() },
            ]}
            data={resolved}
            keyExtractor={(r) => r.id}
            emptyMessage="No history"
          />
        </div>
      )}
    </div>
  );
}
