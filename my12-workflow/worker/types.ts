export type Stage =
  | "pending"
  | "awaiting-approval"
  | "paying"
  | "preparing"
  | "baking"
  | "delivering"
  | "delivered"
  | "rejected";

export type Order = {
  orderId: string;
  stage: Stage;
  etaMinutes?: number;
  note?: string;
  chargeAttempts?: number;
};

export type State = {
  orders: Record<string, Order>;
};
