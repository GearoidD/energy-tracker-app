"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const money = (n) => Number.isFinite(n) ? `€${n.toLocaleString("en-IE", { maximumFractionDigits: 0 })}` : "—";
const annualCost = ({ usage, unitRate, standing, capacity = 0, other = 0 }) => {
  const u = Number(usage), r = Number(unitRate), s = Number(standing || 0), c = Number(capacity || 0), o = Number(other || 0);
  if (!Number.isFinite(u) || !Number.isFinite(r)) return null;
  return (u * r / 100) + (s * 365 / 100) + c + o;
};

export default function AddQuoteForm({ accounts = [] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const selected = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);
  const currentAnnual = selected ? annualCost({ usage:selected.usage, unitRate:selected.rate, standing:selected.standing_charge }) : null;

  const submit = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/quotes/extract", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ quoteText:text, accountId: accountId || null }) });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Something went wrong"); else { setResult(data); setText(""); }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return <div>
    <div style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:10,padding:16,marginBottom:16}}>
      <label style={{display:"block",fontWeight:700,fontSize:13,marginBottom:7}}>Compare this quote with an account</label>
      <select value={accountId} onChange={e=>setAccountId(e.target.value)} style={{width:"100%",padding:10,borderRadius:7,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)"}}>
        <option value="">Market intelligence only — no account</option>
        {accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.location ? ` · ${a.location}`:""} · {a.fuel_type}</option>)}
      </select>
      {selected && <div style={{fontSize:12,color:"var(--muted)",marginTop:9}}>Current basis: {Number(selected.usage||0).toLocaleString("en-IE")} kWh/year · {selected.rate ?? "—"}c/kWh · {selected.standing_charge ?? "—"}c/day. Current modelled annual energy + standing cost: <strong style={{color:"var(--text)"}}>{money(currentAnnual)}</strong>.</div>}
    </div>

    <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste the full supplier quote, including rate tables, standing charges, capacity charges and conditions..." rows={14} style={{width:"100%",background:"var(--panel)",border:"1px solid var(--border)",borderRadius:8,padding:14,color:"var(--text)",fontSize:16,fontFamily:"inherit",resize:"vertical",outline:"none",marginBottom:14}}/>
    <button onClick={submit} disabled={loading || text.trim().length < 20} style={{background:"var(--teal)",border:"none",color:"#fff",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13.5,opacity:text.trim().length<20?.6:1}}>{loading?"Reading quote…":"Extract & compare quote"}</button>
    {error && <div style={{marginTop:16,padding:"12px 16px",background:"var(--panel)",border:"1px solid var(--red)",borderRadius:8,color:"var(--red)",fontSize:13}}>{error}</div>}
    {result && <div style={{marginTop:18}}>
      <div style={{padding:"14px 16px",background:"var(--panel)",border:"1px solid var(--green)",borderRadius:8,marginBottom:12}}><strong style={{color:"var(--green)"}}>✓ {result.added} quote option{result.added===1?"":"s"} captured</strong><div style={{fontSize:12,color:"var(--muted)",marginTop:5}}>{accountId ? "Saved against this renewal and added to market intelligence." : "Added to verified market intelligence."}</div></div>
      <div style={{display:"grid",gap:10}}>{result.rates.map((r,i)=>{
        const offer = selected ? annualCost({usage:selected.usage,unitRate:r.unit_rate_cents,standing:r.standing_charge_cents,capacity:r.capacity_charge_annual,other:r.other_annual_charges}) : null;
        const diff = currentAnnual!=null && offer!=null ? currentAnnual-offer : null;
        return <div key={i} style={{background:"var(--panel)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{r.provider}</strong><div style={{fontSize:12,color:"var(--muted)",marginTop:3}}>{r.fuel_type}{r.tariff_band?` · ${r.tariff_band}`:""}{r.contract_length_months?` · ${r.contract_length_months} months`:""}</div></div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700}}>{r.unit_rate_cents}c/kWh</div></div>
          {selected && <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginTop:14}}><div><small style={{color:"var(--muted)"}}>Projected annual cost</small><div><strong>{money(offer)}</strong></div></div><div><small style={{color:"var(--muted)"}}>vs current basis</small><div><strong>{diff==null?"—":`${diff>=0?"−":"+"}${money(Math.abs(diff))}`}</strong></div></div><div><small style={{color:"var(--muted)"}}>Standing charge</small><div><strong>{r.standing_charge_cents ?? "—"}c/day</strong></div></div></div>}
          <div style={{fontSize:11.5,color:"var(--muted)",marginTop:12}}>Projection includes quoted unit rate, standing charge and any extracted annual capacity/other charges. Taxes, levies and usage changes may still affect the final bill; verify the supplier contract before approval.</div>
        </div>})}</div>
      <button onClick={()=>router.push("/dashboard?scope=company&section=renewals")} style={{marginTop:14,background:"none",border:"1px solid var(--border-light)",color:"var(--teal)",padding:"8px 14px",borderRadius:6,cursor:"pointer",fontSize:12.5,fontWeight:600}}>Review renewals →</button>
    </div>}
  </div>;
}
