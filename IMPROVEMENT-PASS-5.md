# GnóRate Pass 5 — Procurement Platform Foundation

## Implemented
- Transparent annual cost engine with separate projected cost, recorded invoice totals, tariff components and confidence.
- Quote projected cost uses annual usage × quoted unit rate + standing + capacity + other annual charges.
- Quote acceptance records the decision and advances the renewal to Switching; enhanced acceptance/audit fields degrade safely until migrated.
- Procurement/RFQ schema for account-specific sourcing and supplier-linked offers.
- Daily Market Intelligence section and 06:15 UTC cron.
- Daily scan stores SEM power, European gas, Brent, EU carbon, EUR/USD, 7-day changes, source metadata and a directional pressure signal.
- Market narrative is explicitly a procurement signal, not a retail-price forecast.

## Required migration
Run `supabase/migration-procurement-market.sql` in Supabase before enabling the new procurement and market tables.

## Required environment variables
Existing `CRON_SECRET` and `ANTHROPIC_API_KEY` are used by the daily market scan. Existing Supabase variables remain required.

## Important commercial boundary
The current "Accept offer" action records a customer's commercial selection and moves the workflow to Switching. It does not claim to execute a legally binding supplier contract. Before describing the product as end-to-end switching, integrate each participating supplier's required authority/terms/e-sign flow and validate applicable Irish regulatory, disclosure, commission and data-protection requirements.

## Next external integrations
1. Supplier onboarding agreements and structured supplier quote submission.
2. Supplier-specific e-sign / Letter of Authority / contract execution.
3. Deterministic licensed feeds for gas/carbon/commodity data where commercial scale requires stronger SLAs than sourced daily web intelligence.
4. Automated switch-status callbacks where suppliers/network market interfaces permit them.
