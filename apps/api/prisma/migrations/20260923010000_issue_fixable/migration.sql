-- Phase 6 (production-without-Paymob-or-AI master plan): persists the
-- capability-declared `fixable` flag onto Issue, so the report UI can hide
-- a "fix this" CTA on findings that are not user-fixable in the traditional
-- sense (the three contradiction.* findings). Additive, backward-compatible:
-- every existing row defaults to true (unchanged behavior — a fix CTA was
-- already shown for everything before this column existed).
ALTER TABLE "Issue" ADD COLUMN "fixable" BOOLEAN NOT NULL DEFAULT true;
