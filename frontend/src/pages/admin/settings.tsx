import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Save, Server, Mail, Palette, Send } from "lucide-react";
import { api } from "../../api/client";

interface SettingsMap {
  [key: string]: { value: string; label: string; group: string; hint?: string };
}

const groupInfo: Record<string, { icon: typeof Server; title: string; description: string }> = {
  server: { icon: Server, title: "Server Configuration", description: "Your VPS hostname and IP — used in all DNS instructions sent to clients" },
  mail: { icon: Mail, title: "Mail Configuration", description: "Email-related settings for DMARC reports and attachment limits" },
  branding: { icon: Palette, title: "Branding", description: "Platform name and support contact shown to clients" },
  relay: { icon: Send, title: "Outbound Relay", description: "Configure SMTP relay for outbound email delivery (Brevo, Mailgun, etc.). Set to 'direct' to send from your server." },
};

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get("admin/settings").json<SettingsMap>(),
  });

  useEffect(() => {
    if (settings) {
      const values: Record<string, string> = {};
      for (const [key, s] of Object.entries(settings)) {
        values[key] = s.value;
      }
      setForm(values);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      api.put("admin/settings", { json: data }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) return <div className="text-gray-400">Loading settings...</div>;

  // Group settings by category
  const groups: Record<string, Array<{ key: string; value: string; label: string; hint?: string }>> = {};
  if (settings) {
    for (const [key, s] of Object.entries(settings)) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push({ key, value: form[key] ?? s.value, label: s.label, hint: s.hint });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings size={24} className="text-gray-500" />
          <div>
            <h1 className="text-2xl font-bold">Platform Settings</h1>
            <p className="text-sm text-gray-500">Configure your mail server details — these values appear in DNS setup guides for all clients</p>
          </div>
        </div>
        <button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={16} />
          {saveMutation.isPending ? "Saving..." : "Save All"}
        </button>
      </div>

      {saved && (
        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-md text-sm mb-6">
          Settings saved successfully! DNS instructions for all clients are now updated.
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(groups).map(([groupKey, fields]) => {
          const info = groupInfo[groupKey] ?? { icon: Settings, title: groupKey, description: "" };
          const Icon = info.icon;

          return (
            <div key={groupKey} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-1">
                <Icon size={20} className="text-gray-500" />
                <h2 className="text-lg font-semibold">{info.title}</h2>
              </div>
              <p className="text-sm text-gray-400 mb-4 ml-8">{info.description}</p>

              <div className="space-y-4 ml-8">
                {fields.map(({ key, value, label, hint }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="text"
                      value={form[key] ?? ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      className="w-full max-w-lg px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {hint && (
                      <p className="text-xs text-blue-600 mt-1 max-w-lg">{hint}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">Key: <code className="bg-gray-100 px-1 rounded">{key}</code></p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
