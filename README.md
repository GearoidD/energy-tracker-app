# GnóRate — starter app

*Know before your contract renews.*

A real, multi-tenant web app version of the tracker: email/password login,
each company's data kept separate, hosted on your own Supabase + Vercel
accounts (both have free tiers that comfortably cover this).

## 1. Create a Supabase project

1. Go to https://supabase.com → New project (free tier is fine).
2. Once it's created, open **SQL Editor** → New query, paste in the full
   contents of `supabase/schema.sql`, and run it. This creates the
   `companies`, `profiles`, and `accounts` tables plus the security rules
   that keep each company's data private from every other company.
3. Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public key** — you'll need both next.
4. (Optional, for faster testing) Go to **Authentication → Providers →
   Email** and turn off "Confirm email" so new signups can log in
   immediately without clicking an email link. Turn it back on before
   real users sign up.

## 2. Configure the app

```bash
cp .env.local.example .env.local
```

Open `.env.local` and add your Supabase Project URL and anon key from step 1. The service role key and the AI, email, and cron keys are optional; add them only if you use those features. Never commit `.env.local` to GitHub.

## 3. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on the login page. Click
"Create one" to sign up, name your company, and you're in.

## 4. Deploy it for real

The easiest path is Vercel (made by the creators of Next.js, free tier is enough):

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com → New Project → import that repo.
3. In the project's Environment Variables settings, add the same two
   variables from your `.env.local`.
4. Deploy. You'll get a live `https://your-app.vercel.app` URL with real
   logins, usable by your whole team.

## How data is kept separate between companies

Every account row has a `company_id`. Supabase's Row Level Security
(defined in `schema.sql`) means the database itself — not just the app
code — refuses to return or accept data for any company other than the
one the logged-in user belongs to. This is what makes it safe to have
multiple companies using the same database.

## Portal sections

The client portal includes a portfolio dashboard, an account register, rate comparisons, usage and bill history, renewals, savings opportunities, report exports, and workspace settings. These views reuse the existing Supabase account and reading data.

The overview only shows spend estimates when enough bill history exists, and charts display a clear empty state until readings are available.
