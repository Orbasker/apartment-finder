import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Apartment Finder — AI-assisted Tel Aviv apartment search",
  description:
    "Aggregates Yad2 and Facebook groups, filters listings against your preferences with AI, and pings you on Telegram the moment something matches.",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-sm font-semibold tracking-tight">Apartment Finder</span>
          </a>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="hidden hover:text-foreground sm:inline">
              How it works
            </a>
            <a href="#features" className="hidden hover:text-foreground sm:inline">
              Features
            </a>
            <a
              href="#signin"
              className="rounded-md border px-3 py-1.5 text-foreground hover:bg-muted"
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-6">
        <section className="grid gap-10 py-16 md:grid-cols-[1.1fr_1fr] md:gap-16 md:py-24">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              24/7 monitoring · Tel Aviv
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Find the right apartment before anyone else sees it.
            </h1>
            <p className="text-lg text-muted-foreground">
              Apartment Finder watches Yad2 and dozens of Facebook groups around the clock,
              filters noise and reposts with AI, and pings you on Telegram the moment a
              listing matches your preferences.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Stat label="Sources" value="Yad2 + FB groups" />
              <Stat label="Signal" value="AI-filtered" />
              <Stat label="Alerts" value="Telegram, real-time" />
            </div>
          </div>

          <div id="signin" className="md:pt-2">
            <Card className="mx-auto w-full max-w-md">
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                <p className="pt-1 text-sm text-muted-foreground">
                  Continue to your dashboard and alerts.
                </p>
              </CardHeader>
              <CardContent>
                <LoginForm />
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="border-t py-16">
          <SectionHeading
            eyebrow="What it does"
            title="One pipeline for every source that matters."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<IconLayers />}
              title="Aggregates every source"
              body="Yad2 and the Facebook groups where real listings actually appear — collected continuously, normalized into one feed."
            />
            <FeatureCard
              icon={<IconSpark />}
              title="AI scores the signal"
              body="A judge model reads each listing against your preferences, drops spam and reposts, and escalates borderline cases to a stronger model."
            />
            <FeatureCard
              icon={<IconBell />}
              title="Real-time alerts"
              body="Matches arrive on Telegram with a conversational agent — ask follow-up questions, mark interested, or dismiss. No dashboard-checking required."
            />
          </div>
        </section>

        <section id="how" className="border-t py-16">
          <SectionHeading eyebrow="How it works" title="Four steps, fully automated." />
          <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Step
              n="01"
              title="Set preferences"
              body="Budget, neighborhoods, rooms, must-haves, deal-breakers — as specific as you like."
            />
            <Step
              n="02"
              title="We collect"
              body="Scheduled jobs pull Yad2 and Facebook groups every few minutes, dedupe, and store."
            />
            <Step
              n="03"
              title="AI filters"
              body="Each listing is scored; only the ones that actually fit your brief reach you."
            />
            <Step
              n="04"
              title="You get pinged"
              body="Matches arrive on Telegram the moment they appear — with a link, key facts, and a chat-able agent."
            />
          </ol>
        </section>

        <section className="border-t py-16">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <SectionHeading
                eyebrow="Why it exists"
                title="Because the listings you want get buried."
              />
              <p className="mt-6 text-muted-foreground">
                Tel Aviv is a noisy market — Yad2 plus dozens of Facebook groups, most posts
                are agency spam, duplicates, or reposts. Good listings disappear in hours.
                Manual monitoring doesn&apos;t scale; this does.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-6 text-sm">
              <p className="font-medium text-foreground">Built with</p>
              <ul className="mt-3 grid grid-cols-2 gap-y-2 text-muted-foreground">
                <li>Next.js 15 + RSC</li>
                <li>Supabase Postgres</li>
                <li>Vercel AI Gateway</li>
                <li>Claude 4 (Haiku → Sonnet)</li>
                <li>Telegram (grammY)</li>
                <li>Apify + custom scrapers</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to stop refreshing?</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Sign in to set up your preferences and start receiving matches.
          </p>
          <a
            href="#signin"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in to continue
          </a>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-6 shadow-sm">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="rounded-lg border bg-background p-5">
      <div className="text-xs font-semibold text-muted-foreground">{n}</div>
      <div className="mt-2 font-medium text-foreground">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </li>
  );
}

function LogoMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m5.6 18.4 2.8-2.8" />
      <path d="m15.6 8.4 2.8-2.8" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
