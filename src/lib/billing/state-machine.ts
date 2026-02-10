export type SubscriptionStatus = "trialing" | "active" | "past_due" | "grace" | "canceled" | "blocked";

export function nextSubscriptionStatus(
  current: SubscriptionStatus,
  eventClass: "checkout_completed" | "subscription_renewed" | "payment_failed" | "subscription_canceled" | "unknown",
): SubscriptionStatus {
  if (eventClass === "checkout_completed" || eventClass === "subscription_renewed") return "active";
  if (eventClass === "payment_failed") return current === "active" ? "past_due" : "grace";
  if (eventClass === "subscription_canceled") return "canceled";
  return current;
}
