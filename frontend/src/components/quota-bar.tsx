import { cn } from "../lib/utils";

interface QuotaBarProps {
  used: number;
  total: number;
  label?: string;
}

export function QuotaBar({ used, total, label }: QuotaBarProps) {
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{label}</span>
          <span>
            {used} / {total} MB
          </span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            percent > 90
              ? "bg-red-500"
              : percent > 70
                ? "bg-yellow-500"
                : "bg-blue-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
