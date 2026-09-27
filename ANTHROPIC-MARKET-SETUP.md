# GnóRate — Anthropic Market Intelligence setup

The code is already wired. No Anthropic key is stored in this project.

## Vercel environment variables
Add these in Vercel → Project → Settings → Environment Variables:

- `ANTHROPIC_API_KEY` — your Anthropic API key (server only; never use NEXT_PUBLIC_)
- `CRON_SECRET` — a long random secret used to protect the scheduled route
- `SUPABASE_SERVICE_ROLE_KEY` — existing Supabase service role key used by trusted server jobs
- `NEXT_PUBLIC_SUPABASE_URL` — existing value
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — existing value
- `ANTHROPIC_MARKET_MODEL` — optional; defaults to `claude-sonnet-5`

Redeploy after adding/changing environment variables.

## Daily schedule
`vercel.json` calls `/api/cron/market-intelligence` daily at 06:15 UTC.

## First test
After deployment, sign into GnóRate and open Market Intelligence. Click **Run live market scan**. The button calls an authenticated server route; your Anthropic and Supabase service-role keys never reach the browser.

A successful run upserts today's row into `public.market_snapshots`. Refreshing the Market Intelligence page will show the snapshot and source links.

## Failure messages
The route now reports common setup failures explicitly, including missing `ANTHROPIC_API_KEY`, missing service-role key, Anthropic API errors, invalid model/web-search access, invalid JSON, and Supabase write errors.

## Data integrity
Claude is instructed to use `null` rather than inventing an unverified market figure. The market-pressure score is a directional procurement signal and is not represented as a retail-price forecast.
