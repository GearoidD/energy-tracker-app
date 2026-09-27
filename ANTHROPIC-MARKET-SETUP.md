# GnóRate Daily Market Intelligence

GnóRate now uses one centrally scheduled market-intelligence job. Customers do not trigger Anthropic.

## Required Vercel environment variables
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- existing Supabase public variables

Optional: `ANTHROPIC_MARKET_MODEL` (defaults to `claude-sonnet-5`).

## Schedule
`vercel.json` calls `/api/cron/market-intelligence` daily at 06:15 UTC.

## Cost / call control
The route is idempotent by date: if today's `market_snapshots` row already exists, a retry exits before calling Anthropic. Each scheduled run makes one Anthropic Messages API request and allows at most one Anthropic web-search execution. If Anthropic returns `pause_turn`, an API error, or unusable output, GnóRate does not make a continuation call and leaves the previous successful snapshot live.

## Customer experience
There is no manual "Run live market scan" button or public run endpoint. The Market Intelligence page reads the latest shared snapshot from Supabase.
