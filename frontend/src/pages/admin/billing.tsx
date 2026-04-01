import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { adminApi, type Invoice, type BillingOverview } from "../../api/admin";
import { StatCard } from "../../components/stat-card";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

export function AdminBillingPage() {
  const { data: overview } = useQuery({
    queryKey: ["billing-overview"],
    queryFn: adminApi.billingOverview,
  });

  const { data: invoiceList = [], isLoading } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: adminApi.listInvoices,
  });

  const columns = [
    { key: "number", header: "Invoice #", render: (i: Invoice) => <span className="font-medium">{i.invoiceNumber}</span> },
    { key: "client", header: "Client", render: (i: Invoice) => i.clientName },
    { key: "amount", header: "Amount", render: (i: Invoice) => `${i.currency} ${i.amount}` },
    { key: "due", header: "Due Date", render: (i: Invoice) => formatDate(i.dueDate) },
    {
      key: "status", header: "Status", render: (i: Invoice) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          i.status === "paid" ? "bg-green-100 text-green-700"
          : i.status === "overdue" ? "bg-red-100 text-red-700"
          : i.status === "cancelled" ? "bg-gray-100 text-gray-600"
          : "bg-yellow-100 text-yellow-700"
        }`}>{i.status}</span>
      ),
    },
    { key: "paid", header: "Paid At", render: (i: Invoice) => i.paidAt ? formatDate(i.paidAt) : "-" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Revenue" value={`$${overview?.totalRevenue?.toFixed(2) ?? "0.00"}`} icon={<DollarSign size={24} />} />
        <StatCard title="Pending" value={`$${overview?.pendingAmount?.toFixed(2) ?? "0.00"}`}
          icon={<FileText size={24} />} subtitle={`${overview?.pendingCount ?? 0} invoices`} />
        <StatCard title="Overdue" value={overview?.overdueCount ?? 0} icon={<AlertTriangle size={24} />} />
        <StatCard title="Collected" value={`$${overview?.totalRevenue?.toFixed(2) ?? "0.00"}`} icon={<CheckCircle size={24} />} />
      </div>

      <h2 className="text-lg font-semibold mb-4">All Invoices</h2>
      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <DataTable columns={columns} data={invoiceList} keyExtractor={(i) => i.id} emptyMessage="No invoices created yet." />
      )}
    </div>
  );
}
