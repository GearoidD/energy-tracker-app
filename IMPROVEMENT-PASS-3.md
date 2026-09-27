# GnóRate improvement pass 3 — 94% target

## Rate-change trust workflow
- Rate increase alerts now lead to a dedicated Review & confirm rate action.
- Users can Confirm the detected bill rate, Correct the extracted rate, or Dismiss the alert.
- Confirm/Correct updates the trusted account rate; Correct also fixes the bill record.
- Every decision records reviewer + timestamp on the reading and writes an activity_log entry.
- Reviewed rate jumps no longer return as unresolved alerts. A newer bill can create a fresh alert.

## Why this matters
This closes the detection → human verification → trusted data → audit trail loop. It reduces alert fatigue and makes account rates defensible for renewal decisions.

## Database migration note
Existing deployments must add readings.rate_review_status, rate_reviewed_at and rate_reviewed_by. The baseline schema now contains these fields.
