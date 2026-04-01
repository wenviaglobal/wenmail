import { useQuery } from "@tanstack/react-query";
import { portalApi } from "../../api/portal";
import { DataTable } from "../../components/data-table";
import { formatDate } from "../../lib/utils";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

interface Payment {
  id: string;
  amount: string;
  method: string;
  transactionRef: string;
  paidAt: string;
}

export function PortalBillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-billing"],
    queryFn: () => portalApi.get("billing").json<{ invoices: Invoice[]; payments: Payment[] }>(),
  });

  const invoiceColumns = [
    { key: "number", header: "Invoice #", render: (i: Invoice) => <span className="font-medium">{i.invoiceNumber}</span> },
    { key: "amount", header: "Amount", render: (i: Invoice) => `${i.currency} ${i.amount}` },
    { key: "period", header: "Period", render: (i: Invoice) => `${formatDate(i.periodStart)} - ${formatDate(i.periodEnd)}` },
    { key: "due", header: "Due Date", render: (i: Invoice) => formatDate(i.dueDate) },
    {
      key: "status", header: "Status", render: (i: Invoice) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          i.status === "paid" ? "bg-green-100 text-green-700"
          : i.status === "overdue" ? "bg-red-100 text-red-700"
          : "bg-yellow-100 text-yellow-700"
        }`}>{i.status}</span>
      ),
    },
  ];

  const paymentColumns = [
    { key: "amount", header: "Amount", render: (p: Payment) => `$${p.amount}` },
    { key: "method", header: "Method", render: (p: Payment) => p.method.replace("_", " ") },
    { key: "ref", header: "Reference", render: (p: Payment) => p.transactionRef ?? "-" },
    { key: "date", header: "Paid On", render: (p: Payment) => formatDate(p.paidAt) },
  ];

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      <h2 className="text-lg font-semibold mb-3">Invoices</h2>
      <div className="mb-8">
        <DataTable columns={invoiceColumns} data={data?.invoices ?? []} keyExtractor={(i) => i.id} emptyMessage="No invoices yet." />
      </div>

      <h2 className="text-lg font-semibold mb-3">Payment History</h2>
      <DataTable columns={paymentColumns} data={data?.payments ?? []} keyExtractor={(p) => p.id} emptyMessage="No payments recorded." />
    </div>
  );
}
