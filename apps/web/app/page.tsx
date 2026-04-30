import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { isGoogleConfigured } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth-server";
import { env } from "@/lib/env";
import { FlowDiagram } from "./_landing/flow-diagram";
import { AiExtractor } from "./_landing/ai-extractor";
import { ChatPreview } from "./_landing/chat-preview";

export const metadata = {
  title: "Apartment Finder - דירה בעיר שלך, לפני כולם",
  description:
    "סורקים את Yad2, Madlan וקבוצות פייסבוק 24/7. AI מחלץ את הפרטים, מסנן לפי הטעם שלך, ושולח התראה לאימייל / WhatsApp / Telegram.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const authed = !!user;
  const primaryHref = authed ? "/matches" : "/login";
  const primaryLabel = authed ? "לדירות" : "התחל בחינם";
  const secondaryChatHref = authed ? "/onboarding" : "/login";

  const oneTapClientId = env().NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-4 sm:px-6 sm:pt-6">
      {!authed && isGoogleConfigured() && oneTapClientId && (
        <GoogleOneTap clientId={oneTapClientId} redirectTo="/matches" />
      )}
      <header className="mb-8 flex items-center justify-between sm:mb-12">
        <span className="text-base font-semibold tracking-tight sm:text-lg">Apartment Finder</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {authed ? (
            <Link href="/matches">
              <Button size="sm">לדירות</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button size="sm" variant="ghost">
                  כניסה
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm">התחלה</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="grid items-center gap-8 sm:gap-10 md:grid-cols-2 md:gap-14">
        <div className="order-2 md:order-1">
          <Pill>AI · רץ 24/7 · מקורות מרובים</Pill>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-[2.6rem]">
            דירה בעיר שלך,
            <br />
            <span className="text-accent">לפני כולם.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            אנחנו סורקים את <Source>Yad2</Source>, <Source>Madlan</Source> וקבוצות{" "}
            <Source>Facebook</Source> ברגע שמופיע פוסט. ה-AI מחלץ את הנתונים, מסנן לפי הקריטריונים
            שלך, ושולח התראה ל<Dest>אימייל</Dest>, <Dest>WhatsApp</Dest> או <Dest>Telegram</Dest>.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href={primaryHref} className="block">
              <Button className="h-11 w-full px-5 text-base sm:w-auto">{primaryLabel}</Button>
            </Link>
            <Link href="#how-it-works" className="block">
              <Button variant="outline" className="h-11 w-full px-5 text-base sm:w-auto">
                איך זה עובד
              </Button>
            </Link>
          </div>
          <ul className="mt-6 grid gap-1.5 text-sm text-muted-foreground">
            <Bullet>התראות תוך דקות מהפרסום</Bullet>
            <Bullet>סינון חכם - בלי תיווך, בלי כפילויות</Bullet>
            <Bullet>אונבורדינג בצ׳אט, בעברית, ב-2 דקות</Bullet>
          </ul>
        </div>

        <div className="order-1 md:order-2">
          <FlowDiagram />
        </div>
      </section>

      <section id="how-it-works" className="mt-16 sm:mt-24">
        <SectionHeader eyebrow="איך זה עובד" title="3 שלבים. בלי לרענן את Yad2 פעם בשעה." />
        <ol className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          <Step
            n={1}
            title="מחבר/ים את המקורות"
            body={<>Yad2, Madlan וקבוצות Facebook נסרקות באופן רציף. כל פוסט חדש נכנס לתור.</>}
          />
          <Step
            n={2}
            title="ה-AI מחלץ ומסנן"
            body={
              <>המודל קורא את הטקסט החופשי, מחלץ חדרים / שטח / מחיר / שכונה, ומשווה לסינון שלך.</>
            }
          />
          <Step
            n={3}
            title="התראה אישית"
            body={<>התאמה? נשלחת התראה - לאימייל, WhatsApp או Telegram - עם לינק ישיר למודעה.</>}
          />
        </ol>
      </section>

      <section className="mt-16 sm:mt-24">
        <SectionHeader
          eyebrow="מחלץ AI"
          title="פוסט גולמי נכנס. נתונים מובנים יוצאים."
          description="המודל מבין עברית מדוברת, מטפל ב-RTL, מנקה תיווך וכפילויות, ומחזיר שדות שאפשר לסנן עליהם."
        />
        <div className="mt-6">
          <AiExtractor />
        </div>
      </section>

      <section className="mt-16 sm:mt-24">
        <SectionHeader
          eyebrow="צ׳אט אונבורדינג"
          title="בלי טפסים מסורבלים."
          description="2 דקות בצ׳אט, תקבל/י התראות מדויקות. אפשר לעדכן בכל רגע."
        />
        <div className="mt-6 grid items-start gap-6 md:grid-cols-2 md:gap-8">
          <ChatPreview />
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <Highlight>
              <span className="font-medium text-foreground">תקציב, חדרים, שכונות, חובות.</span> כל
              שאלה על שורה אחת.
            </Highlight>
            <Highlight>
              <span className="font-medium text-foreground">בעברית טבעית.</span> בלי dropdowns, בלי
              סליידרים. תכתוב/י כמו לחבר/ה.
            </Highlight>
            <Highlight>
              <span className="font-medium text-foreground">עריכה בכל רגע.</span> משנים דרישות? חזרה
              לצ׳אט או ל-/filters.
            </Highlight>
            <div className="pt-2">
              <Link href={secondaryChatHref} className="block">
                <Button variant="outline" className="h-10">
                  {authed ? "המשך/י לצ׳אט" : "התחל/י את הצ׳אט"}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16 rounded-2xl border bg-card p-6 shadow-sm sm:mt-24 sm:p-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Pill>{authed ? "החשבון שלך מוכן" : "חינם להתחלה"}</Pill>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {authed ? "ממשיכים מהמקום שעצרנו." : "הדירה הבאה שלך כנראה כבר פורסמה."}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            {authed
              ? "הסינונים נשמרו. אפשר לחזור לדשבורד או לעדכן בצ׳אט."
              : "הגדר/י סינונים פעם אחת. אנחנו נטפל בשאר."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href={primaryHref}>
              <Button className="h-11 px-6 text-base">{primaryLabel}</Button>
            </Link>
            <Link href={secondaryChatHref}>
              <Button variant="outline" className="h-11 px-6 text-base">
                {authed ? "המשך/י לצ׳אט" : "לצ׳אט אונבורדינג"}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-1 text-2xs font-medium text-muted-foreground backdrop-blur-sm">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      {children}
    </span>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Dest({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <CheckMark />
      {children}
    </li>
  );
}

function CheckMark() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-success"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3 8 3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
      )}
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
          <bdi>{n}</bdi>
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <p>{children}</p>
    </div>
  );
}
