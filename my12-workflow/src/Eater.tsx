import { useAgent } from "agents/react";
import { useState } from "react";
import type { Stage, State } from "../worker/types";

const LABELS: Partial<Record<Stage, string>> = {
  pending: "⏳ pending",
  "awaiting-approval": "⏸ waiting for restaurant",
  paying: "💳 charging card…",
  preparing: "🍳 preparing",
  baking: "🔥 baking",
  delivering: "🚗 delivering",
  delivered: "✅ delivered",
  rejected: "❌ rejected",
};

const BADGE_CLASS: Partial<Record<Stage, string>> = {
  pending: "bg-amber-100 text-amber-700",
  "awaiting-approval": "bg-amber-100 text-amber-700",
  paying: "bg-blue-100 text-blue-700",
  preparing: "bg-blue-100 text-blue-700",
  baking: "bg-blue-100 text-blue-700",
  delivering: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export function Eater() {
  const [state, setState] = useState<State>({ orders: {} });
  const agent = useAgent({
    agent: "RestaurantAgent",
    query: { role: "eater" },
    onStateUpdate: setState,
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">🍕 Order</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Place an order. The kitchen has to approve before we charge your
            card.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => agent.stub.placeOrder()}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Order Pizza
            </button>
          </div>
        </section>

        {Object.values(state.orders).map((order) => (
          <section
            key={order.orderId}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
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

            {order.stage === "paying" && order.chargeAttempts != null && (
              <p className="mt-2 text-sm text-zinc-700">
                Attempt {order.chargeAttempts}…
              </p>
            )}

            {order.etaMinutes != null && (
              <p className="mt-2 text-sm text-zinc-700">
                Ready in ~{order.etaMinutes} min
              </p>
            )}
            {order.note && (
              <p className="mt-1 text-sm italic text-zinc-500">
                Kitchen says: {order.note}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
