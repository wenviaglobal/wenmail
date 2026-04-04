import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
}

export function StatCard({ title, value, icon, subtitle }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold mt-1 dark:text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="text-gray-400 dark:text-slate-500">{icon}</div>
      </div>
    </div>
  );
}
