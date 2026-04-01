import { useQuery } from "@tanstack/react-query";
import { portalApi } from "../../api/portal";
import { Upload, Download } from "lucide-react";

interface MigrationInfo {
  import: { method: string; description: string; instructions: string[]; supportEmail: string };
  export: { methods: Array<{ name: string; description: string }>; note: string };
}

export function PortalMigrationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-migration"],
    queryFn: () => portalApi.get("migration/info").json<MigrationInfo>(),
  });

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Import / Export</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Import */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-100 p-2 rounded-lg"><Upload className="text-indigo-600" size={24} /></div>
            <div>
              <h2 className="text-lg font-semibold">Import Emails</h2>
              <p className="text-sm text-slate-500">{data?.import.method}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-4">{data?.import.description}</p>
          <ol className="space-y-2">
            {data?.import.instructions.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="bg-indigo-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-slate-600">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 p-3 bg-slate-50 rounded text-sm">
            Contact: <a href={`mailto:${data?.import.supportEmail}`} className="text-indigo-600 hover:underline">{data?.import.supportEmail}</a>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 p-2 rounded-lg"><Download className="text-green-600" size={24} /></div>
            <div>
              <h2 className="text-lg font-semibold">Export Emails</h2>
              <p className="text-sm text-slate-500">Download your data anytime</p>
            </div>
          </div>
          <div className="space-y-3">
            {data?.export.methods.map((method) => (
              <div key={method.name} className="border border-slate-100 rounded-lg p-3">
                <h3 className="font-medium text-sm">{method.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{method.description}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">{data?.export.note}</p>
        </div>
      </div>
    </div>
  );
}
