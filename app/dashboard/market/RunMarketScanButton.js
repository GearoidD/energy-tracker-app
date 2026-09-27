"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunMarketScanButton(){
  const router=useRouter();
  const [state,setState]=useState({busy:false,message:""});
  async function run(){
    setState({busy:true,message:"Running live Anthropic market scan…"});
    try{
      const res=await fetch("/api/market-intelligence/run",{method:"POST"});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.detail||data?.error||"Market scan failed");
      setState({busy:false,message:"Market intelligence updated."});
      router.refresh();
    }catch(error){setState({busy:false,message:error.message||"Market scan failed"});}
  }
  return <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><button className="gn-btn" onClick={run} disabled={state.busy}>{state.busy?"Scanning market…":"Run live market scan"}</button>{state.message&&<span style={{fontSize:12,color:"var(--muted)"}}>{state.message}</span>}</div>;
}
