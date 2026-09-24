"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowRight, BarChart3, Building2, Check, ChevronDown, CircleDollarSign, FileText, Flame, Leaf, Menu, ShieldCheck, Users, Zap } from "lucide-react";

function IrelandScene() {
  return <svg className="home-ireland-scene" viewBox="0 0 900 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#bde8f2"/><stop offset=".58" stopColor="#f8e9d1"/><stop offset="1" stopColor="#e4c29a"/></linearGradient>
      <linearGradient id="hill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#3d7564"/><stop offset="1" stopColor="#183f36"/></linearGradient>
    </defs>
    <rect width="900" height="430" fill="url(#sky)"/>
    <circle cx="695" cy="93" r="38" fill="#fff4dc" opacity=".8"/>
    <path d="M0 250Q180 195 350 238T680 215T900 233V430H0Z" fill="#6b9a80" opacity=".65"/>
    <path d="M0 280Q130 230 290 269T590 245T900 264V430H0Z" fill="url(#hill)"/>
    <g fill="#f6f0e5" stroke="#21453d" strokeWidth="4">
      <path d="M30 265h78v95H30zM122 246h80v114h-80zM222 267h80v93h-80zM320 236h91v124h-91zM432 255h73v105h-73zM527 230h83v130h-83zM628 256h79v104h-79zM724 236h86v124h-86zM826 260h74v100h-74z"/>
    </g>
    <g fill="#a4583e"><path d="m21 267 48-43 49 43zM112 248l50-44 51 44zM212 270l50-42 50 42zM310 239l56-47 56 47zM422 257l46-39 47 39zM517 232l52-46 52 46zM618 258l49-41 50 41zM714 238l53-45 53 45zM816 263l46-39 47 39z"/></g>
    <path d="M674 226V72l13-32 13 32v154M667 78h39M680 106h16M680 137h16M680 168h16" fill="#23433d" stroke="#23433d" strokeWidth="6"/>
    <g fill="#f8dcae"><rect x="47" y="289" width="10" height="15"/><rect x="80" y="289" width="10" height="15"/><rect x="144" y="273" width="11" height="17"/><rect x="177" y="273" width="11" height="17"/><rect x="342" y="262" width="12" height="17"/><rect x="380" y="262" width="12" height="17"/><rect x="551" y="258" width="12" height="17"/><rect x="588" y="258" width="12" height="17"/></g>
    <path d="M0 361q180-25 360 0t540-4v73H0z" fill="#123d31" opacity=".45"/>
  </svg>;
}

function PortalPreview() {
  return <div className="home-preview-wrap">
    <div className="home-preview-caption"><span className="home-preview-live"/> SAMPLE CLIENT PORTAL</div>
    <div className="home-preview">
      <aside className="home-preview-side"><b><Zap size={15}/> Gnó<span>Rate</span></b>{[[BarChart3,"Dashboard"],[Building2,"Accounts"],[Zap,"Rates"],[Activity,"Usage"],[CircleDollarSign,"Savings"],[FileText,"Reports"]].map(([Icon,label],i)=><span key={label} className={i===0?"selected":""}><Icon size={12}/>{label}</span>)}<small>Illustrative preview</small></aside>
      <div className="home-preview-main"><div className="home-preview-top"><div><small>YOUR PORTFOLIO</small><h3>Dashboard</h3></div><span>Last 12 months <ChevronDown size={12}/></span></div>
        <div className="home-preview-metrics">{[["Annual spend","€482,320"],["Potential savings","€64,800"],["Active accounts","12"],["Rate opportunities","5"]].map(([label,value],i)=><div key={label}><small>{label}</small><b className={i===1?"positive":""}>{value}</b><em>{i===1?<><ArrowDownRight size={11}/> Opportunity</>:i===2?"2 renewing soon":"Portfolio view"}</em></div>)}</div>
        <div className="home-preview-charts"><div className="home-preview-chart"><b>Spend by utility</b><div className="home-donut"><span>€482k</span></div><small><i/> Electricity <i className="gas-dot"/> Gas</small></div><div className="home-preview-chart"><b>Monthly usage</b><div className="home-bars">{[30,44,38,58,49,69,54,82,63,76,58,91].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div><small>Recorded account usage</small></div></div>
      </div>
    </div>
  </div>;
}

const featureCards = [
  { icon: BarChart3, title: "Compare rates", text: "See current account rates beside available market opportunities." },
  { icon: FileText, title: "Manage contracts", text: "Keep suppliers, bills and contract end dates together." },
  { icon: Activity, title: "Track usage", text: "Bring readings into one clear view across your locations." },
  { icon: CircleDollarSign, title: "Identify savings", text: "Find accounts where the available comparisons suggest a better option." },
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <main className="gn-home">
    <header className="home-nav"><div className="home-nav-inner">
      <Link href="/" className="home-brand"><span><Zap size={20}/></span><b>Gnó<span>Rate</span></b></Link>
      <nav className="home-nav-links"><a href="#platform">Product</a><a href="#solutions">Solutions</a><a href="#utilities">Utilities</a><a href="#how-it-works">Resources</a><a href="#about">About</a></nav>
      <div className="home-nav-actions"><Link className="home-login" href="/login">Client login</Link><Link className="home-button small" href="/signup">Get started <ArrowRight size={14}/></Link></div>
      <button className="home-mobile-toggle" aria-label="Toggle navigation" onClick={()=>setMobileOpen(v=>!v)}><Menu size={21}/></button>
    </div>{mobileOpen&&<nav className="home-mobile-menu"><a href="#platform" onClick={()=>setMobileOpen(false)}>Product</a><a href="#solutions" onClick={()=>setMobileOpen(false)}>Solutions</a><a href="#utilities" onClick={()=>setMobileOpen(false)}>Utilities</a><a href="#how-it-works" onClick={()=>setMobileOpen(false)}>How it works</a><Link href="/login">Client login</Link><Link href="/signup">Get started →</Link></nav>}</header>

    <section className="home-hero" id="platform"><div className="home-hero-scene"><IrelandScene/></div><div className="home-hero-wash"/><div className="home-wrap home-hero-inner">
      <div className="home-hero-copy"><div className="home-eyebrow"><span/> COMMERCIAL UTILITY INTELLIGENCE</div><h1>Irish by name.<br/><em>Built for business.</em></h1><p>GnóRate helps Irish businesses track, compare and manage electricity and gas contracts — all in one intelligent platform.</p><div className="home-hero-actions"><Link className="home-button" href="/signup">Get started <ArrowRight size={16}/></Link><a className="home-button secondary" href="#how-it-works">See how it works <span className="play-icon">▶</span></a></div>
        <div className="home-proof-points"><span><Check size={14}/> Business accounts</span><span><Check size={14}/> Irish tariff aware</span><span><Check size={14}/> Team ready</span></div>
      </div><PortalPreview/>
    </div><div className="home-hero-curve"/></section>

    <section className="home-capabilities" aria-label="GnóRate capabilities"><div className="home-wrap home-capability-grid">{featureCards.map(({icon:Icon,title,text})=><article key={title}><span><Icon size={22}/></span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section>

    <section className="home-proof-band" id="about"><div className="home-wrap proof-inner"><div className="proof-map" aria-hidden="true"><svg viewBox="0 0 170 205"><path d="M88 7 68 17l-2 17-17 9-4 20-16 14 5 20-14 18 10 15-4 18 17 13 6 20 23 13 22-10 9-18 19-7 7-19 14-14-5-19 9-16-9-19 4-17-14-14-1-21-17-10-4-17-15-5Z" fill="#087d61" stroke="#1cc69b" strokeWidth="2"/><path d="m37 77 67-31m-78 62 90-57m-75 89 81-66m-62 88 70-68M55 45l7 98m20-122 8 135m22-114-3 108m20-84-12 60" stroke="#36b897" strokeWidth="1" opacity=".55"/></svg></div><div className="proof-copy"><div className="home-eyebrow light"><span/> ROOTED IN IRELAND. BUILT FOR BUSINESS.</div><h2>Smarter utility decisions<br/>for <em>Irish businesses.</em></h2><p>Bring energy accounts, contract dates and rate comparisons into one shared workspace.</p><div className="proof-metrics"><div><Users size={25}/><b>One view</b><span>Across your business accounts</span></div><div><Zap size={25}/><b>Electricity + gas</b><span>Commercial utility tracking</span></div><div><ShieldCheck size={25}/><b>More control</b><span>Confident renewal planning</span></div><div><TrendingDownIcon/><b>Find opportunities</b><span>From available comparisons</span></div></div></div></div></section>

    <section className="home-visibility" id="utilities"><div className="home-wrap visibility-grid"><div><div className="home-eyebrow"><span/> ONE PLATFORM. CLEARER OVERSIGHT.</div><h2>Complete visibility across your <em>utility contracts.</em></h2><p>Centralise electricity and gas accounts, compare rates, monitor usage and keep upcoming renewals in view.</p><div className="utility-list"><div><Zap size={19}/> Electricity</div><div><Flame size={19}/> Gas</div></div><Link className="text-link" href="/signup">Explore the client portal <ArrowRight size={15}/></Link></div><div className="visibility-art"><div className="office-building"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="floating-note"><span><Zap size={15}/></span><b>Better visibility.<br/>Stronger decisions.</b><small>Keep rates, usage and renewals close at hand.</small></div></div></div></section>

    <section className="home-sustainability" id="solutions"><div className="home-wrap sustainability-grid"><div className="coast-art"><div className="coast-sun"/><div className="coast-cliff cliff-a"/><div className="coast-cliff cliff-b"/><div className="coast-stats"><Leaf size={21}/><b>Better choices, backed by data</b><small>See account trends and opportunities in one place.</small></div></div><div className="sustainability-copy"><div className="home-eyebrow"><span/> A MORE INFORMED APPROACH</div><h2>Lower costs today.<br/><em>Better decisions tomorrow.</em></h2><p>Use clear account data to plan renewals, review rates and make informed utility decisions for your business.</p><ul><li><Check size={17}/> Identify rate opportunities</li><li><Check size={17}/> Keep renewals on your radar</li><li><Check size={17}/> Review usage across accounts</li><li><Check size={17}/> Make decisions with better data</li></ul></div></div></section>

    <section className="home-how" id="how-it-works"><div className="home-wrap"><div className="home-eyebrow center"><span/> HOW IT WORKS</div><h2>Simple, powerful, effective.</h2><div className="home-steps">{[["01","Connect your accounts","Add utility accounts or import details from a bill."],["02","See your data","Review suppliers, usage, costs and renewal dates."],["03","Compare and plan","Find opportunities and prepare before renewal."],["04","Stay in control","Keep your team aligned from one workspace."]].map(([n,title,text])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

    <section className="home-final-cta"><div className="home-wrap final-cta-inner"><div><div className="home-eyebrow light"><span/> READY TO TAKE CONTROL?</div><h2>Make your next renewal<br/>a more informed one.</h2><p>Bring your utility contracts into one clear view with GnóRate.</p></div><div className="final-cta-actions"><Link className="home-button" href="/signup">Get started <ArrowRight size={16}/></Link><Link href="/login">Already have an account? Client login</Link></div></div><i className="cta-ring ring-one"/><i className="cta-ring ring-two"/></section>

    <footer className="home-footer"><div className="home-wrap"><div className="footer-main"><div className="footer-brand"><Link href="/" className="home-brand"><span><Zap size={19}/></span><b>Gnó<span>Rate</span></b></Link><p>Commercial utility intelligence for smarter business decisions.</p><small>Born in Ireland. Built for business.</small></div><div><b>Product</b><a href="#platform">Overview</a><a href="#utilities">Utilities</a><a href="#how-it-works">How it works</a></div><div><b>Resources</b><Link href="/help">Help centre</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy-policy">Privacy</Link></div><div><b>Account</b><Link href="/login">Client login</Link><Link href="/signup">Get started</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} GnóRate. All rights reserved.</span><span>Ireland · Commercial energy</span></div></div></footer>
  </main>;
}

function TrendingDownIcon(){return <ArrowDownRight size={25}/>;}
