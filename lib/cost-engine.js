export function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function projectedAnnualCost(account, readings = [], quote = null) {
  const dated = [...readings].filter(r => r.reading_date).sort((a,b)=>String(b.reading_date).localeCompare(String(a.reading_date)));
  const invoice = dated.filter(r => n(r.total_cost) !== null);
  const latest = dated[0] || null;
  const usage = n(account.usage) ?? n(latest?.annual_usage) ?? null;
  const rate = quote ? n(quote.unit_rate_cents) : (n(latest?.rate) ?? n(account.rate));
  const standing = quote ? n(quote.standing_charge_cents) : (n(latest?.standing_charge) ?? n(account.standing_charge));
  const capacityAnnual = quote ? (n(quote.capacity_charge_annual) || 0) : (n(account.mic_charge) || 0);
  const otherAnnual = quote ? (n(quote.other_annual_charges) || 0) : 0;

  const energy = usage !== null && rate !== null ? usage * rate / 100 : null;
  const standingAnnual = standing !== null ? standing * 365 / 100 : null;
  const projected = energy !== null ? energy + (standingAnnual || 0) + capacityAnnual + otherAnnual : null;

  // Recorded invoice spend is deliberately not called annual spend unless we have ~a year of evidence.
  const trailing = invoice.slice(0, 12).reduce((s,r)=>s+(n(r.total_cost)||0),0);
  const oldest = invoice.length ? new Date(invoice[invoice.length-1].reading_date+"T00:00:00") : null;
  const newest = invoice.length ? new Date(invoice[0].reading_date+"T00:00:00") : null;
  const invoiceSpanDays = oldest && newest ? Math.max(0, Math.round((newest-oldest)/86400000)) : 0;
  const trailingIsAnnual = invoice.length >= 10 || invoiceSpanDays >= 300;

  let confidence = 0;
  const basis = [];
  if (usage !== null) { confidence += 35; basis.push("annual usage"); }
  if (rate !== null) { confidence += 30; basis.push(quote ? "quoted unit rate" : "latest/current unit rate"); }
  if (standing !== null) { confidence += 15; basis.push("standing charge"); }
  if (capacityAnnual || account.mic_kva) { confidence += 10; basis.push("capacity/MIC information"); }
  if (invoice.length >= 5) { confidence += 10; basis.push(`${invoice.length} recorded invoice totals`); }
  confidence = Math.min(100, confidence);

  return {
    projected,
    trailingRecorded: invoice.length ? trailing : null,
    trailingIsAnnual,
    invoiceCount: invoice.length,
    components: { energy, standing: standingAnnual, capacity: capacityAnnual, other: otherAnnual },
    usage, rate, confidence, basis,
    label: quote ? "Quote projected annual cost" : "Projected annual energy cost",
    caveat: "Projection based on recorded annual usage and tariff components. Taxes, levies, network/pass-through charges and VAT are included only where captured in the tariff or invoice data."
  };
}
