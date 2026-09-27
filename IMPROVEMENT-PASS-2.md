# GnóRate — Commercial Readiness Pass 2

## Added
- Account-specific supplier quote capture and comparison.
- Whole-cost projection using annual usage, unit rate, standing charge, and explicitly quoted annual capacity/other fixed charges.
- Quote provenance retained against the account for renewal review.
- Renewal status automatically moves to `quote_requested` when an account quote is captured.
- Activity log records quote receipt for future audit/history UI.
- Renewal ownership/target-date fields added to the data model.
- `master_rates` baseline fixed to match the quote ingestion API (`source`, `submitted_by`, `submitted_by_company`).
- Explicit financial caveat prevents indicative rate differences being represented as guaranteed savings.

## Remaining 90+ production work
- Render quote shortlist/approve/reject controls directly in the renewal account view.
- Add immutable audit UI for renewal approvals.
- Connect a maintained/verified external market-rate source rather than relying on submitted/admin reference data.
- CI: clean install, lint/type checks, production build, integration tests and RLS isolation tests.
- Model taxes/levies and supplier-specific pass-through charges where contract data permits.
