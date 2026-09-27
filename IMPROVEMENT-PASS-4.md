# GnóRate Improvement Pass 4 — Renewal Command Centre

This pass moves GnóRate from renewal reminders toward end-to-end renewal management.

## Added
- Renewal Command Centre in the Renewals section.
- 30/60-day and overdue renewal exposure summary.
- Current annual cost basis beside each renewal.
- Account-specific supplier quote options surfaced from `quote_offers`.
- Whole-cost quote projection: unit rate + standing charge + extracted annual capacity/other fixed charges.
- Quote decision states: Received, Shortlisted, Approved, Rejected.
- Approving a quote advances the account to Switching.
- Quote decisions are written to the activity log.
- Graceful fallback when `quote_offers` has not yet been migrated.

## Existing strengths retained
- Historical bill fallback for pre-rate-review schemas.
- Rate-change confirmation workflow.
- Renewal urgency rules.
- Portfolio/reporting PDFs and account confidence.

## Deployment note
Apply the current `supabase/schema.sql` additions (especially `quote_offers` and `activity_log`) to enable the full quote-decision workflow. The UI does not fail if the quote table is unavailable.
