export function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const DAY_MS = 86400000;
// Generic Irish business profiles. These are deliberately conservative defaults,
// not supplier forecasts. They only influence estimates when a full year is absent.
const SEASONAL_SHARE = {
  gas:         [0.155,0.140,0.120,0.090,0.060,0.035,0.025,0.025,0.045,0.080,0.105,0.120],
  electricity: [0.090,0.085,0.085,0.080,0.080,0.075,0.075,0.075,0.080,0.085,0.090,0.100],
};

function dateOnly(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0,10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isoDay(d) { return d.toISOString().slice(0,10); }
function daysInclusive(a,b) { return Math.floor((b-a)/DAY_MS)+1; }

function seasonalShareForPeriod(start, end, fuel) {
  const weights = SEASONAL_SHARE[fuel === "gas" ? "gas" : "electricity"];
  let share = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime()+DAY_MS)) {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const dim = new Date(Date.UTC(year, month+1, 0)).getUTCDate();
    share += weights[month] / dim;
  }
  return share;
}

export function annualUsageEstimate(account, readings = []) {
  const manual = n(account?.usage);
  const rows = readings
    .map(r => ({
      ...r,
      _start: dateOnly(r.billing_period_start),
      _end: dateOnly(r.billing_period_end || r.reading_date),
      _proxyDate: dateOnly(r.reading_date || r.billing_period_end || r.created_at),
      _usage: n(r.usage)
    }))
    .filter(r => r._usage !== null && r._usage >= 0);

  const exactCandidates = rows
    .filter(r => r._start && r._end && r._end >= r._start)
    .sort((a,b) => b._end-a._end);

  // Prefer exact billing periods whenever they exist. Prevent overlapping/duplicate
  // periods from inflating the estimate.
  const usedDays = new Set();
  const accepted = [];
  let overlapCount = 0;
  for (const r of exactCandidates) {
    let overlap = false;
    for (let d=new Date(r._start); d<=r._end; d=new Date(d.getTime()+DAY_MS)) {
      if (usedDays.has(isoDay(d))) { overlap = true; break; }
    }
    if (overlap) { overlapCount++; continue; }
    accepted.push(r);
    for (let d=new Date(r._start); d<=r._end; d=new Date(d.getTime()+DAY_MS)) usedDays.add(isoDay(d));
  }

  const fuel = account?.fuel_type === "gas" ? "gas" : "electricity";
  if (accepted.length) {
    const totalUsage = accepted.reduce((s,r)=>s+r._usage,0);
    const coverageDays = usedDays.size;
    const seasonalCoverage = accepted.reduce((s,r)=>s+seasonalShareForPeriod(r._start,r._end,fuel),0);
    let usage, method, confidence;

    // Do not publish an annual projection until there is at least four months
    // of measured coverage. Below that threshold, the account should show the
    // observed bill data only rather than extrapolating a precise-looking year.
    if (coverageDays < 120) {
      usage = null;
      method = "Insufficient bill history for annual projection";
      confidence = 0;
    } else if (coverageDays >= 330) {
      // With close to a full year of measured coverage, use the actual run-rate.
      usage = totalUsage * (365 / coverageDays);
      method = "Measured 12-month run-rate";
      confidence = Math.min(98, 88 + Math.round(Math.min(35, coverageDays-330)/4));
    } else {
      // Once four months are available, annualise the account's own observed
      // daily consumption. Do not impose a generic seasonal profile: commercial
      // properties have materially different operating patterns.
      usage = totalUsage * (365 / coverageDays);
      method = "Measured bill-period run-rate";
      confidence = Math.min(87, 45 + Math.round((coverageDays - 120) / 7));
    }
    if (overlapCount) confidence = Math.max(20, confidence - Math.min(15, overlapCount*5));

    return {
      usage: Math.round(usage), source: "bills", method, confidence, coverageDays,
      billCount: accepted.length, overlapCount, totalObservedUsage: totalUsage,
      detail: coverageDays < 120
        ? `${accepted.length} bill${accepted.length===1?"":"s"} covering ${coverageDays} unique days; ${Math.round(totalUsage).toLocaleString("en-IE")} kWh recorded. Four months of measured coverage is required before GnóRate publishes an annual projection.`
        : `${accepted.length} bill${accepted.length===1?"":"s"} covering ${coverageDays} unique days; ${Math.round(totalUsage).toLocaleString("en-IE")} kWh recorded. Annual usage is based on this account's measured daily run-rate${coverageDays >= 330 ? " across approximately a full year" : ""}${overlapCount ? `; ${overlapCount} overlapping bill${overlapCount===1?" was":"s were"} excluded` : ""}.`
    };
  }

  // Backward-compatible historical estimate for older bills that do not have
  // stored billing-period starts. We still require four months of inferred
  // coverage before exposing an annual projection.
  const historical = rows.filter(r => r._proxyDate).sort((a,b)=>a._proxyDate-b._proxyDate);
  if (historical.length) {
    const positiveGaps = [];
    for (let i=1;i<historical.length;i++) {
      const gap = Math.round((historical[i]._proxyDate-historical[i-1]._proxyDate)/DAY_MS);
      if (gap >= 14 && gap <= 95) positiveGaps.push(gap);
    }
    positiveGaps.sort((a,b)=>a-b);
    const typicalDays = positiveGaps.length ? positiveGaps[Math.floor(positiveGaps.length/2)] : 30;
    const proxyPeriods = historical.map((r,i) => {
      let days = typicalDays;
      if (i > 0) {
        const gap = Math.round((r._proxyDate-historical[i-1]._proxyDate)/DAY_MS);
        if (gap >= 14 && gap <= 95) days = gap;
      }
      const end = r._proxyDate;
      const start = new Date(end.getTime() - (Math.max(1,days)-1)*DAY_MS);
      return {...r, _proxyStart:start, _proxyEnd:end, _proxyDays:days};
    });
    const totalUsage = proxyPeriods.reduce((s,r)=>s+r._usage,0);
    const inferredDays = proxyPeriods.reduce((s,r)=>s+r._proxyDays,0);
    const usage = inferredDays >= 120 ? totalUsage * (365/Math.max(1,inferredDays)) : null;
    const usedUploadFallback = proxyPeriods.some(r => !r.reading_date && !r.billing_period_end && r.created_at);
    let confidence = usage === null ? 0 : Math.min(72, 35 + historical.length*6 + Math.min(12, positiveGaps.length*2));
    if (historical.length === 1) confidence = 0;
    if (usedUploadFallback && usage !== null) confidence = Math.max(25, confidence-8);
    return {
      usage: usage === null ? null : Math.round(usage), source: "historical-bills",
      method: usage === null ? "Insufficient bill history for annual projection" : "Measured historical bill-date run-rate",
      confidence, coverageDays: inferredDays, billCount: historical.length, overlapCount: 0,
      totalObservedUsage: totalUsage,
      detail: inferredDays < 120
        ? `${historical.length} existing bill${historical.length===1?"":"s"} covering approximately ${inferredDays} days. Four months of measured coverage is required before GnóRate publishes an annual projection.`
        : `${historical.length} existing bill${historical.length===1?"":"s"} covering approximately ${inferredDays} days. Annual usage is based on the measured historical daily run-rate.`
    };
  }

  return {
    usage: manual, source: manual !== null ? "saved" : "missing",
    method: manual !== null ? "Saved annual usage" : "Annual usage unavailable",
    confidence: manual !== null ? 45 : 0, coverageDays: 0, billCount: 0, overlapCount: 0,
    detail: manual !== null ? "Using the annual usage saved on the account because no usable bill consumption history is available yet." : "Upload a bill with kWh usage; GnóRate can use its bill date as a seasonal estimate even before exact billing-period dates are available."
  };
}

export function projectedAnnualCost(account, readings = [], quote = null) {
  const dated = [...readings].filter(r => r.reading_date || r.billing_period_end).sort((a,b)=>String(b.billing_period_end||b.reading_date).localeCompare(String(a.billing_period_end||a.reading_date)));
  const invoice = dated.filter(r => n(r.total_cost) !== null);
  const latest = dated[0] || null;
  const usageEstimate = annualUsageEstimate(account, readings);
  const usage = usageEstimate.usage;
  const projectionEligible = usage !== null && (usageEstimate.source === "saved" || usageEstimate.coverageDays >= 120);
  const rate = quote ? (n(quote.unit_rate_cents) ?? n(quote.unit_rate)) : (n(latest?.rate) ?? n(account.rate));
  const standing = quote ? (n(quote.standing_charge_cents) ?? n(quote.standing_charge)) : (n(latest?.standing_charge) ?? n(account.standing_charge));
  const capacityAnnual = quote ? (n(quote.capacity_charge_annual) ?? n(quote.capacity_charge) ?? 0) : (n(account.mic_charge) || 0);
  const otherAnnual = quote ? (n(quote.other_annual_charges) || 0) : 0;

  const energy = projectionEligible && rate !== null ? usage * rate / 100 : null;
  const standingAnnual = standing !== null ? standing * 365 / 100 : null;
  const projected = energy !== null ? energy + (standingAnnual || 0) + capacityAnnual + otherAnnual : null;

  const trailing = invoice.slice(0, 12).reduce((s,r)=>s+(n(r.total_cost)||0),0);
  const periodStarts = invoice.map(r=>dateOnly(r.billing_period_start)).filter(Boolean);
  const periodEnds = invoice.map(r=>dateOnly(r.billing_period_end||r.reading_date)).filter(Boolean);
  const oldest = periodStarts.length ? new Date(Math.min(...periodStarts)) : null;
  const newest = periodEnds.length ? new Date(Math.max(...periodEnds)) : null;
  const invoiceSpanDays = oldest && newest ? Math.max(0, Math.round((newest-oldest)/DAY_MS)+1) : 0;
  const trailingIsAnnual = invoiceSpanDays >= 330;

  let confidence = Math.round(usageEstimate.confidence * 0.55);
  const basis = [usageEstimate.method];
  if (rate !== null) { confidence += 25; basis.push(quote ? "quoted unit rate" : "latest/current unit rate"); }
  if (standing !== null) { confidence += 10; basis.push("standing charge"); }
  if (capacityAnnual || account.mic_kva) { confidence += 5; basis.push("capacity/MIC information"); }
  if (invoice.length >= 5) { confidence += 5; basis.push(`${invoice.length} recorded invoice totals`); }
  confidence = Math.min(100, confidence);

  return {
    projected, projectionEligible, trailingRecorded: invoice.length ? trailing : null, trailingIsAnnual,
    invoiceCount: invoice.length, components: { energy, standing: standingAnnual, capacity: capacityAnnual, other: otherAnnual },
    usage, usageEstimate, rate, confidence, basis,
    label: quote ? "Quote projected annual cost" : "Projected annual energy cost",
    caveat: "Projection uses bill-period-aware annual usage where available. Taxes, levies, network/pass-through charges and VAT are included only where captured in tariff or invoice data."
  };
}
