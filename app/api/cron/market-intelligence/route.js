import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  const admin=createAdminClient();
  const response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-5",max_tokens:1200,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Build today's evidence-led Irish commercial energy market snapshot. Search primary/reputable sources, prioritising SEMOpx for Single Electricity Market day-ahead power, recognised European TTF gas data, Brent crude, EU ETS carbon and EUR/USD. Return ONLY JSON. Never invent a value. Use null if a current figure cannot be verified. World events may explain movements but must not determine the numeric score by themselves.\n{\n"sem_day_ahead_eur_mwh":number|null,"sem_change_7d_pct":number|null,"gas_eur_mwh":number|null,"gas_change_7d_pct":number|null,"brent_usd_bbl":number|null,"brent_change_7d_pct":number|null,"carbon_eur_t":number|null,"carbon_change_7d_pct":number|null,"eur_usd":number|null,"pressure_score":number,"pressure_label":"Low"|"Stable"|"Elevated"|"High","narrative":"max 90 words, explain evidence and explicitly say this is not a retail-price forecast","sources":[{"name":"string","url":"https://...","as_of":"YYYY-MM-DD"}]\n}\nPressure score is 0-100 and should primarily reflect the direction/magnitude of power and gas, with smaller weight for carbon/oil/FX. Retail supplier prices can lag wholesale markets due to hedging.`}]} )});
  const payload=await response.json();
  const block=payload.content?.find(x=>x.type==="text")?.text?.replace(/```json|```/g,"").trim();
  if(!block) return NextResponse.json({error:"No market snapshot returned"},{status:502});
  let parsed; try{parsed=JSON.parse(block)}catch{return NextResponse.json({error:"Market snapshot was not valid JSON"},{status:502})}
  const row={snapshot_date:new Date().toISOString().slice(0,10),sem_day_ahead_eur_mwh:parsed.sem_day_ahead_eur_mwh??null,sem_change_7d_pct:parsed.sem_change_7d_pct??null,gas_eur_mwh:parsed.gas_eur_mwh??null,gas_change_7d_pct:parsed.gas_change_7d_pct??null,brent_usd_bbl:parsed.brent_usd_bbl??null,brent_change_7d_pct:parsed.brent_change_7d_pct??null,carbon_eur_t:parsed.carbon_eur_t??null,carbon_change_7d_pct:parsed.carbon_change_7d_pct??null,eur_usd:parsed.eur_usd??null,pressure_score:Math.max(0,Math.min(100,Number(parsed.pressure_score)||50)),pressure_label:parsed.pressure_label||"Stable",narrative:parsed.narrative||null,source_meta:{sources:parsed.sources||[],method:"daily sourced market scan; directional signal, not forecast"}};
  const {error}=await admin.from("market_snapshots").upsert(row,{onConflict:"snapshot_date"});
  if(error) return NextResponse.json({error:error.message,migration_required:true},{status:500});
  return NextResponse.json({ok:true,snapshot:row});
}
