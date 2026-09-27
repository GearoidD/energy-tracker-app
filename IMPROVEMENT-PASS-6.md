# GnóRate Improvement Pass 6 — Bill-period-aware annual usage

## What changed
- Bill extraction now captures billing-period start and end dates.
- Annual usage is calculated from actual covered billing days rather than treating bill count/upload dates as annual evidence.
- Near-full-year coverage (330+ unique days) uses observed consumption annualised to 365 days.
- Partial coverage (60+ days) uses conservative fuel-specific monthly seasonality profiles for gas/electricity.
- Limited coverage uses simple daily annualisation and is explicitly low-confidence.
- Overlapping billing periods are excluded from the annual-usage estimate.
- Saved account annual usage remains the fallback where no complete bill periods exist.
- Projected annual usage now shows calculation method, covered days, bill count and confidence.
- Projected annual energy cost and quote comparisons use the same annual-usage source of truth.

## Deploy
1. Run `supabase/migration-billing-periods.sql` in Supabase SQL Editor.
2. Deploy the project files.
3. Upload a new bill and confirm both billing-period dates extracted correctly.
4. Existing readings are preserved. Existing `reading_date` values are copied to `billing_period_end`; historical bills need a start date before they can drive the bill-period annualisation.

## Important
The generic seasonal profiles are estimation defaults, not forecasts. Future versions should replace/refine them with validated portfolio/customer load profiles or interval data where available.

### Historical-bill compatibility update
- Existing bills without `billing_period_start` now contribute to projected annual usage immediately.
- GnóRate uses `reading_date` / bill date first; `created_at` (upload date) is only a fallback.
- With multiple historical bills, approximate billing duration is inferred from the spacing between bill dates (14–95 day plausible window; median gap fallback).
- Fuel-specific seasonal weighting is then applied to those inferred periods.
- These estimates deliberately carry lower confidence than exact billing-period calculations and automatically improve as future bills include start/end dates.
