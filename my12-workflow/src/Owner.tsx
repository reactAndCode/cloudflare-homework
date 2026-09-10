import { useAgent } from "agents/react";
import { useState } from "react";
import type { Order, Stage, State } from "../worker/types";

const LABELS: Partial<Record<Stage, string>> = {
  "awaiting-approval": "⏸ awaiting",
  paying: "💳 charging",
  preparing: "🍳 preparing",
  baking: "🔥 baking",
  delivering: "🚗 delivering",
  delivered: "✅ delivered",
  rejected: "❌ rejected",
};

const BADGE_CLASS: Partial<Record<Stage, string>> = {
  "awaiting-approval": "bg-amber-100 text-amber-700",
  paying: "bg-blue-100 text-blue-700",
  preparing: "bg-blue-100 text-blue-700",
  baking: "bg-blue-100 text-blue-700",
  delivering: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export function Owner() {
  const [state, setState] = useState<State>({ orders: {} });
  const agent = useAgent({
    agent: "RestaurantAgent",
    query: { role: "owner" },
    onStateUpdate: setState,
  });

  const orders = Object.values(state.orders);
  const pending = orders.filter((order) => order.stage === "awaiting-approval");

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">🍕 Kitchen</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Approve incoming orders with an ETA and an optional note for the
            customer.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Pending</h2>
          <div className="mt-3 space-y-3">
            {pending.length === 0 && (
              <p className="text-sm text-zinc-400">No pending orders.</p>
            )}
            {pending.map((order) => (
              <PendingCard
                key={order.orderId}
                order={order}
                onApprove={(eta, note) =>
                  agent.stub.approveOrder(order.orderId, eta, note)
                }
                onReject={() => agent.stub.rejectOrder(order.orderId)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">All</h2>
          <div className="mt-3 space-y-2">
            {orders.length === 0 && (
              <p className="text-sm text-zinc-400">No orders yet.</p>
            )}
            {orders.map((order) => (
              <div
                key={order.orderId}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2"
              >
                <span className="font-mono text-xs text-zinc-500">
                  {order.orderId}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    BADGE_CLASS[order.stage] ?? "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {LABELS[order.stage] ?? order.stage}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PendingCard({
  order,
  onApprove,
  onReject,
}: {
  order: Order;
  onApprove: (eta: number, note: string) => void;
  onReject: () => void;
}) {
  const [eta, setEta] = useState(20);
  const [note, setNote] = useState("");

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <span className="block font-mono text-xs text-zinc-500">
        {order.orderId}
      </span>
      <div className="flex gap-2">
        <input
          type="number"
          value={eta}
          onChange={(e) => setEta(Number(e.currentTarget.value))}
          aria-label="ETA in minutes"
          className="w-24 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-400"
        />
        <span className="self-center text-sm text-zinc-500">min</span>
        <input
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="note (optional)"
          aria-label="Note"
          className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-zinc-400"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(eta, note)}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
