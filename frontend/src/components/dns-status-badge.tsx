import { cn } from "../lib/utils";

interface DnsStatusBadgeProps {
  label: string;
  configured: boolean;
}

export function DnsStatusBadge({ label, configured }: DnsStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        configured
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          configured ? "bg-green-500" : "bg-red-500",
        )}
      />
      {label}
    </span>
  );
}
