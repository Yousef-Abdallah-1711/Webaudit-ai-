-- Phase 3 (production-without-Paymob-or-AI master plan): distinguishes a
-- Subscription an operator assigned manually (no payment involved) from a
-- real, or dev-stubbed, payment-backed one. Additive, backward-compatible:
-- every existing row defaults to false (unchanged, real-subscription
-- behavior).
ALTER TABLE "Subscription" ADD COLUMN "adminAssigned" BOOLEAN NOT NULL DEFAULT false;
