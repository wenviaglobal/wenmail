import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data found",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-slate-500">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-3 font-medium text-gray-600 dark:text-slate-400"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800/50">
          {data.map((item) => (
            <tr key={keyExtractor(item)} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 dark:text-slate-200">
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
