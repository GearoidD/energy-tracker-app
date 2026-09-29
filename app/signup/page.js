"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Zap, Check, ShieldCheck, ArrowLeft, UserPlus, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authStyles as s } from "../authStyles";
import { HeroCard } from "../AuthHero";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push(next);
      router.refresh();
    } else {
      setCheckEmail(true);
    }
  };

  const loginHref = `/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  const Story = () => (
    <section className="gn-auth-story">
      <div className="gn-auth-story-art" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
      <div className="gn-auth-story-content">
        <span className="gn-auth-eyebrow"><i /> CLIENT PORTAL</span>
        <h1>Get your energy portfolio,<br/><em>all in view.</em></h1>
        <p>Create your secure GnóRate workspace and bring contracts, bills, usage and rate opportunities into one place.</p>
        <div className="gn-auth-story-points">
          <span><Check size={14}/> Built for Irish business accounts</span>
          <span><Check size={14}/> Bills and usage in one workspace</span>
          <span><Check size={14}/> Clear contract and rate visibility</span>
        </div>
        <div className="gn-auth-preview">
          <div className="gn-auth-preview-head"><span><Zap size={13}/> YOUR WORKSPACE</span><i>Ready when you are</i></div>
          <div className="gn-auth-preview-grid"><div><small>ACCOUNTS</small><b>Track sites</b></div><div><small>CONTRACTS</small><b>Renewals</b></div><div><small>RATES</small><b>Compare</b></div></div>
          <div className="gn-auth-preview-bars"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
          <div className="gn-auth-preview-foot"><span><i/> Portfolio overview</span><span>GnóRate client portal</span></div>
        </div>
      </div>
      <div className="gn-auth-story-foot"><ShieldCheck size={14}/> Secure access to your company workspace</div>
    </section>
  );

  if (checkEmail) {
    return (
      <main className="gn-auth-page">
        <header className="gn-auth-nav">
          <Link href="/" className="gn-auth-brand"><span><Zap size={20}/></span><b>Gnó<span>Rate</span></b></Link>
          <Link className="gn-auth-nav-home" href={loginHref}><ArrowLeft size={14}/> Back to login</Link>
        </header>
        <div className="gn-auth-layout">
          <Story />
          <section className="gn-auth-main">
            <div className="gn-auth-card">
              <div className="gn-auth-card-mark"><ShieldCheck size={19}/></div>
              <div className="gn-auth-kicker">ALMOST THERE</div>
              <h2>Check your email</h2>
              <p className="gn-auth-intro">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your GnóRate account.</p>
              <div className="gn-auth-secure-note"><ShieldCheck size={16}/><span>After confirmation, return here to log in and access your workspace.</span></div>
              <p className="gn-auth-signup"><Link href={loginHref}><ArrowLeft size={13}/> Back to login</Link></p>
            </div>
            <div className="gn-auth-bottom"><Link href="/help">Need help?</Link><span>·</span><Link href="/legal/privacy-policy">Privacy</Link><span>·</span><Link href="/legal/terms">Terms</Link></div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="gn-auth-page">
      <header className="gn-auth-nav">
        <Link href="/" className="gn-auth-brand"><span><Zap size={20}/></span><b>Gnó<span>Rate</span></b></Link>
        <Link className="gn-auth-nav-home" href={loginHref}><ArrowLeft size={14}/> Already have an account?</Link>
      </header>
      <div className="gn-auth-layout">
        <Story />
        <section className="gn-auth-main">
          <div className="gn-auth-card">
            <div className="gn-auth-card-mark"><UserPlus size={19}/></div>
            <div className="gn-auth-kicker">NEW CLIENT ACCESS</div>
            <h2>Create your GnóRate account</h2>
            <p className="gn-auth-intro">Set up secure access to your company’s utility workspace.</p>
            <form onSubmit={handleSubmit} className="gn-login-form">
              <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@company.ie"/></label>
              <label>Password<input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Create a password"/></label>
              <div className="gn-signup-password-note"><ShieldCheck size={14}/><span>Use at least 6 characters. Your account is protected by Supabase authentication.</span></div>
              {error&&<div role="alert" className="gn-login-error">{error}</div>}
              <button className="gn-login-submit" type="submit" disabled={loading}>{loading?"Creating your account…":<>Create account <ArrowRight size={16}/></>}</button>
            </form>
            <div className="gn-auth-separator"><span>SECURE CLIENT ACCESS</span></div>
            <div className="gn-auth-secure-note"><ShieldCheck size={16}/><span>Your login is protected and connected to your company workspace.</span></div>
            <p className="gn-auth-signup">Already have an account? <Link href={loginHref}>Log in <ArrowRight size={13}/></Link></p>
          </div>
          <div className="gn-auth-bottom"><Link href="/help">Need help?</Link><span>·</span><Link href="/legal/privacy-policy">Privacy</Link><span>·</span><Link href="/legal/terms">Terms</Link></div>
        </section>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
