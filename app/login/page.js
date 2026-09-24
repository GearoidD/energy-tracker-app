"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  };

  return <main className="gn-auth-page">
    <header className="gn-auth-nav">
      <Link href="/" className="gn-auth-brand"><span><Zap size={20}/></span><b>Gnó<span>Rate</span></b></Link>
      <Link className="gn-auth-nav-home" href="/"><ArrowLeft size={14}/> Back to home</Link>
    </header>
    <div className="gn-auth-layout">
      <section className="gn-auth-story">
        <div className="gn-auth-story-art" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
        <div className="gn-auth-story-content">
          <span className="gn-auth-eyebrow"><i/> CLIENT PORTAL</span>
          <h1>Your energy portfolio,<br/><em>all in view.</em></h1>
          <p>Pick up where your team left off. Review contracts, usage, renewals and rate opportunities from one secure workspace.</p>
          <div className="gn-auth-story-points"><span><Check size={14}/> Built for Irish business accounts</span><span><Check size={14}/> Shared with your team</span><span><Check size={14}/> Your account data in one place</span></div>
          <div className="gn-auth-preview">
            <div className="gn-auth-preview-head"><span><Zap size={13}/> PORTFOLIO SNAPSHOT</span><i>Illustrative view</i></div>
            <div className="gn-auth-preview-grid"><div><small>ACTIVE ACCOUNTS</small><b>Accounts</b></div><div><small>CONTRACTS</small><b>Renewals</b></div><div><small>MARKET DATA</small><b>Rate options</b></div></div>
            <div className="gn-auth-preview-bars"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
            <div className="gn-auth-preview-foot"><span><i/> Workspace overview</span><span>GnóRate client portal</span></div>
          </div>
        </div>
        <div className="gn-auth-story-foot"><ShieldCheck size={14}/> Secure access to your company workspace</div>
      </section>
      <section className="gn-auth-main">
        <div className="gn-auth-card">
          <div className="gn-auth-card-mark"><LockKeyhole size={19}/></div>
          <div className="gn-auth-kicker">WELCOME BACK</div>
          <h2>Log in to GnóRate</h2>
          <p className="gn-auth-intro">Access your company’s utility workspace.</p>
          <form onSubmit={handleSubmit} className="gn-login-form">
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@company.ie"/></label>
            <label>Password<div className="gn-password-field"><input type={showPassword?"text":"password"} autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
            <div className="gn-login-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
            {error&&<div role="alert" className="gn-login-error">{error}</div>}
            <button className="gn-login-submit" type="submit" disabled={loading}>{loading?"Signing you in…":<>Continue to dashboard <ArrowRight size={16}/></>}</button>
          </form>
          <div className="gn-auth-separator"><span>SECURE CLIENT ACCESS</span></div>
          <div className="gn-auth-secure-note"><ShieldCheck size={16}/><span>Your login is protected and connected to your company workspace.</span></div>
          <p className="gn-auth-signup">New to GnóRate? <Link href={`/signup${next!=="/dashboard"?`?next=${encodeURIComponent(next)}`:""}`}>Create an account <ArrowRight size={13}/></Link></p>
        </div>
        <div className="gn-auth-bottom"><Link href="/help">Need help?</Link><span>·</span><Link href="/legal/privacy-policy">Privacy</Link><span>·</span><Link href="/legal/terms">Terms</Link></div>
      </section>
    </div>
  </main>;
}

export default function LoginPage() {
  return <Suspense fallback={<main className="gn-auth-loading"><span className="gn-auth-brand"><b>Gnó<span>Rate</span></b></span></main>}><LoginForm/></Suspense>;
}
