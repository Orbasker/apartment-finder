# Design System - Apartment Finder

The product is a Hebrew-only, RTL, mobile-first apartment alert service for Tel Aviv. The design is intentionally quiet: clean borders, subtle shadows, flat surfaces, and a single brand accent - no gradients anywhere. The interface is dense with information but never noisy.

## Principles

1. **Mobile-first, always.** Every layout is designed at ~375px first, scaled up with `sm:` and `md:`. No layout collapses gracefully - they grow gracefully.
2. **Hebrew + RTL is native, not retrofitted.** `dir="rtl"` on `<html>`, `start-/end-` instead of `left-/right-`, `<bdi>` around numbers, English brand names sit inside Hebrew sentences via `<bdi>` automatically.
3. **Content first.** Generous whitespace, restrained type scale, single accent color. Decoration only appears when it carries meaning (the AI brain pulse, animated particles in the flow diagram).
4. **Token-driven theming.** Light and dark are first-class and switched via a `.dark` class on `<html>`. Every color is a CSS variable, not a Tailwind palette name.

## Color tokens

Defined in `apps/web/app/globals.css` using OKLch (perceptually uniform). All UI references these - never raw hex.

| Token                        | Light                  | Dark                   | Use                                                          |
| ---------------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------ |
| `--color-background`         | `oklch(0.99 0 0)`      | `oklch(0.16 0 0)`      | Page surface                                                 |
| `--color-foreground`         | `oklch(0.14 0 0)`      | `oklch(0.96 0 0)`      | Body text                                                    |
| `--color-card`               | `oklch(1 0 0)`         | `oklch(0.2 0 0)`       | Card / panel surface                                         |
| `--color-muted`              | `oklch(0.96 0 0)`      | `oklch(0.24 0 0)`      | Secondary surface, hover                                     |
| `--color-muted-foreground`   | `oklch(0.45 0 0)`      | `oklch(0.68 0 0)`      | Secondary text                                               |
| `--color-border`             | `oklch(0.92 0 0)`      | `oklch(0.28 0 0)`      | All borders, dividers                                        |
| `--color-input`              | same as border         | same as border         | Input borders                                                |
| `--color-ring`               | `oklch(0.64 0.15 240)` | `oklch(0.7 0.15 240)`  | Focus ring (single blue)                                     |
| `--color-primary`            | `oklch(0.22 0 0)`      | `oklch(0.96 0 0)`      | Primary action (near-black flips in dark)                    |
| `--color-primary-foreground` | inverse                | inverse                | Text on primary                                              |
| `--color-destructive`        | `oklch(0.6 0.22 27)`   | `oklch(0.68 0.22 27)`  | Delete / error                                               |
| `--color-accent`             | `oklch(0.55 0.17 265)` | `oklch(0.78 0.15 265)` | AI accent - eyebrow labels, highlighted headline word, brain |
| `--color-accent-foreground`  | `oklch(0.99 0 0)`      | `oklch(0.16 0 0)`      | Text on accent                                               |
| `--color-success`            | `oklch(0.7 0.17 150)`  | `oklch(0.78 0.18 150)` | OK checkmarks, status dots                                   |
| `--color-success-foreground` | `oklch(0.99 0 0)`      | `oklch(0.16 0 0)`      | Text on success                                              |

**Rule.** No component uses raw `oklch(...)`, `#hex`, or `bg-emerald-500`-style palette colors. Every color is a token (`bg-card`, `text-accent`, `border-success/30`, …) so light/dark themes flip in one place. The same applies to micro type sizes - use the `text-2xs` / `text-3xs` tokens, not arbitrary `text-[10px]` values. Brand colors live in their own `--color-brand-*` namespace and are referenced via Tailwind classes (`bg-brand-yad2`) or CSS variables (`fill="var(--color-brand-facebook)"`) - never as raw hex.

**Rule.** No em-dashes (the `—` character) anywhere in the codebase - in user copy, JSX, comments, or markdown. Use a plain ASCII hyphen `-` instead. Same for the en-dash `–`. Run `grep -rn "—\|–" apps design.md AGENTS.md` before committing.

### Brand colors

The landing flow diagram needs the literal Yad2 yellow, Facebook blue, etc. - these _are_ the brand identities, so they're also tokens but live in their own namespace:

| Token                                          | Value       | Used by                              |
| ---------------------------------------------- | ----------- | ------------------------------------ |
| `--color-brand-yad2`                           | `#FFD400`   | Yad2 source tile + particle          |
| `--color-brand-facebook`                       | `#1877F2`   | Facebook source tile + particle      |
| `--color-brand-madlan`                         | `#0F1A2B`   | Madlan tile background               |
| `--color-brand-madlan-leaf`                    | `#14C17B`   | Madlan leaf glyph + particle         |
| `--color-brand-email`                          | `#0A66C2`   | Email destination tile + particle    |
| `--color-brand-whatsapp`                       | `#25D366`   | WhatsApp destination tile + particle |
| `--color-brand-telegram`                       | `#229ED9`   | Telegram destination tile + particle |
| `--color-brand-google-{blue,green,yellow,red}` | `#4285F4` … | Google sign-in icon segments         |

Brand tokens stay the same in light and dark - the brand identity does not flip with the theme.

### Type scale tokens

Custom relative-unit sizes registered via `@theme` so they're usable as `text-2xs` / `text-3xs`:

| Token        | Value              | Use                                        |
| ------------ | ------------------ | ------------------------------------------ |
| `--text-2xs` | `0.6875rem` (11px) | Pills, badges (e.g. the hero eyebrow pill) |
| `--text-3xs` | `0.625rem` (10px)  | Diagram captions, "demo" / "Enter" hints   |

## Typography

- **Family.** System UI stack via `font-sans` (no custom font files - RTL Hebrew rendering is best on the user's installed system fonts).
- **Scale.**
  - Display headline: `text-3xl sm:text-4xl md:text-[2.6rem]` + `tracking-tight font-semibold`
  - Section title: `text-xl sm:text-2xl` + `tracking-tight font-semibold`
  - Eyebrow: `text-xs uppercase tracking-wider font-semibold` (in accent color)
  - Body: `text-sm sm:text-base leading-relaxed`
  - UI label: `text-sm font-medium`
  - Microcopy: `text-xs` / `text-2xs` / `text-3xs` (custom relative-unit tokens)
- **Numbers.** Always wrapped in `<bdi>` to prevent RTL flipping. Use `tabular-nums` when columns of numbers must align.

## Spacing & layout

- **Container.** Landing page: `max-w-5xl`. Login card: `max-w-md`. Onboarding shell: `max-w-3xl`. Authenticated admin shell is **full-bleed** (no shell-level max-width); each page picks its own inner cap (see "Per-page width policy" below).
- **Page padding.** Mobile: `px-4 py-4 sm:px-6 sm:py-6`. Admin shell adds `md:px-8 md:py-8` on main once the fixed sidebar is in play. Never less on mobile.
- **Section rhythm.** Major landing sections separated by `mt-16 sm:mt-24`.
- **Stack gap.** `gap-2` (tight), `gap-3` (default), `gap-4` to `gap-6` (loose).
- **Card padding.** `p-4` (compact) / `p-5` (default, from `Card`) / `p-6 sm:p-10` (hero-card).

## Radii & elevation

- `rounded-md` - buttons, inputs, small badges
- `rounded-lg` - cards, panels
- `rounded-xl` - icon tiles in the flow diagram
- `rounded-2xl` - chat bubbles, hero CTA card
- `rounded-full` - pills, status dots, avatar-like marks

Shadows are minimal: `shadow-sm` on cards, none on buttons. Elevation comes from borders + background contrast, not blur.

## Components

Lives in `apps/web/src/components/ui/`. Imported via `@/components/ui/...`.

- **`Button`** - CVA variants `default | outline | ghost | destructive` × sizes `default | sm | lg | icon`. Default height `h-9`; landing CTAs use `h-11`. Always include `focus-visible:ring-2 focus-visible:ring-ring`.
- **`Card`, `CardHeader`, `CardTitle`, `CardContent`** - `rounded-lg border bg-background shadow-sm`. Header has bottom border and `p-5`.
- **`Input`** - `h-9 text-sm` default; landing/onboarding bumps to `h-11 text-base` for thumb reach. Numeric inputs get `dir="ltr"` so digits read naturally.
- **`Spinner`** - small SVG, `animate-spin`, currentColor.
- **`ThemeToggle`** - Moon/Sun via lucide-react, persists to `localStorage`.

The landing page composes these primitives plus its own decorative components:

- `FlowDiagram` (`app/_landing/flow-diagram.tsx`) - the SVG animation; pure CSS/SVG, no JS animation library.
- `AiExtractor` (`app/_landing/ai-extractor.tsx`) - looped state machine that re-runs the "raw → structured" reveal.
- `ChatPreview` (`app/_landing/chat-preview.tsx`) - scripted messages with typing indicator; mirrors the production onboarding chat exactly (same bubbles, same RTL alignment).

## RTL conventions

- HTML root: `<html lang="he" dir="rtl">`.
- **Logical properties.** `start-*` / `end-*` / `ms-auto` / `me-auto` / `ps-*` / `pe-*` instead of left/right. Tailwind's `rtl:` variant only used when behavior must differ between LTR/RTL (e.g. drawer translate).
- **Bubble alignment in RTL.** `justify-start` puts content on the right (the "outgoing" side for the user); `justify-end` puts it on the left ("incoming" assistant). This is intentional and matches WhatsApp/Telegram conventions in Hebrew.
- **Mixed-script text.** Hebrew prose containing English brand names ("נסרק מ-Yad2") relies on the browser's default bidi algorithm. Numbers and explicit LTR runs use `<bdi>` to prevent stray flips.
- **Brand names.** Always written in Latin script in the UI (Yad2, Madlan, Facebook, WhatsApp, Telegram, Email) - they are recognized this way by Hebrew speakers.

## Animation

No animation library is installed (no Framer Motion). All motion is:

- **CSS transitions** for hover/focus/state changes on Tailwind utilities (`transition-colors`, `transition-all`).
- **CSS keyframes** for ambient motion (`animate-spin`, `animate-ping`).
- **Native SVG `<animate>` and `<animateMotion>`** for the flow diagram particles. This is intentional - it keeps the page free of JS-driven animation cost, runs at 60fps in every modern browser, and means the diagram is purely a server-rendered SVG.

Motion is never decorative. Each particle on the flow diagram represents a piece of data flowing from a source to the AI, or a notification flowing from the AI to a destination - the animation literally describes the product.

### Flow diagram coordinate system

The flow diagram (`app/_landing/flow-diagram.tsx`) uses a single coordinate system shared by both the SVG (paths and particles) and the CSS-positioned icon tiles. The container is `aspect-square w-full max-w-md`. The SVG inside has `viewBox="0 0 100 100" preserveAspectRatio="none"` so its 100-unit grid maps 1:1 to CSS percentages of the container. Icon tiles are absolutely positioned with `style={{ left: \`${cx}%\`, top: \`${cy}%\` }}`and translated by 50% so their centers sit exactly on the path endpoints (e.g. Facebook at`(15, 18)`, brain at `(50, 50)`, Email at `(85, 82)`). RTL is handled in CSS only (logical `start-/end-` would diverge from the SVG's LTR coordinates), so the icon order is hard-coded for RTL layout: rightmost source = Yad2, leftmost destination = Telegram.

## Iconography

- **App icons** - `lucide-react` (Menu, X, Moon, Sun, etc.). Stroke icons, currentColor, sized via `h-4 w-4`.
- **Brand marks** - `app/_landing/brand-icons.tsx`. Each is a `48×48` rounded tile (`rounded-xl`) with the brand's solid color and the actual brand glyph in white. Sources are real artwork: Yad2's logo loaded from their CDN as an `<img>`, the official Madlan leaf path, and the Facebook "f". Destinations use [Simple Icons](https://simpleicons.org/) CC0 SVG paths for WhatsApp and Telegram (translated 12px into the 48-unit viewBox to leave a consistent 25% padding); email uses a custom envelope.
- **AI brain (`BrainMark`)** - follows the Material/Google AI pattern: solid circle in the brand accent, white `Brain` glyph from `lucide-react`, a soft static `ring-8` halo, and a Tailwind `animate-ping` layer behind for the radar-pulse effect. No gradients, no glow filters - just three solid layers.

## Page-level patterns

### Landing (`/`, public, auth-aware)

The root URL is the marketing page. Middleware excludes `/` from auth checks so visitors land here without a session, but the page itself does an `await getCurrentUser()` and switches CTAs based on state:

- **Logged out**: header shows "כניסה" + "התחלה"; primary CTA → `/login`; chat CTA → `/login`.
- **Logged in**: header shows "לדשבורד"; primary CTA → `/dashboard`; chat CTA → `/onboarding`. Final-CTA copy switches from "הדירה הבאה שלך כנראה כבר פורסמה" to "ממשיכים מהמקום שעצרנו".

The page is composed top-down:

1. **Slim public header** - brand wordmark, theme toggle, auth-aware buttons.
2. **Hero** - eyebrow pill, headline with one word in the brand accent color, supporting paragraph, two CTAs, bullet list. The flow diagram is the visual; on mobile it stacks above the copy, on desktop it sits to the left (`md:order-2` on the copy column lets RTL readers see the diagram on the right).
3. **"How it works"** - three numbered cards.
4. **AI Extractor** - split panel: raw Hebrew listing on one side, animated structured fields on the other.
5. **Chat preview** - replicates the real onboarding UI exactly, with three bullet-cards explaining the value to its right.
6. **Final CTA** - flat `bg-card` panel with rounded corners, single H2, two buttons; copy switches with auth state.

### Authenticated app

Two distinct shells live under `app/(app)/`:

**1. Onboarding shell (`/onboarding`)** - minimal, used only for the first-run chat wizard. The parent `(app)/layout.tsx` is brand-only, no nav, no sidebar - the chat owns the screen so users don't see destinations they can't yet use. Logged-out users are redirected to `/login`; the chat completes by hard-redirecting to `/matches`.

**2. Admin shell (`(app)/(onboarded)/layout.tsx`)** - wraps every post-onboarding route (`/matches`, `/filters`, `/settings`). It enforces both auth and the onboarding gate: any logged-in user without `onboardedAt` is redirected to `/onboarding`. So adding a new authenticated route is a matter of dropping a folder under `(onboarded)/` - the gate is automatic. `/dashboard` and `/notifications` are kept as redirects to `/matches` and `/settings#notifications` so old bookmarks still resolve.

#### Information architecture

The nav has exactly three items: **דירות** (`/matches`, the home), **תנאים** (`/filters`, the search criteria editor), **הגדרות** (`/settings`). There is no separate /dashboard or /notifications page - matches IS the home, and notifications/theme/account all live as sections inside settings. This keeps the surface area tight: one place for outputs (matches), one place for inputs (filters), one place for account-level configuration (settings).

The admin shell is a full-bleed two-pane layout, not a centered max-width column:

- **Mobile (< md)**: top bar with hamburger (`MobileNav` drawer) + brand wordmark. Main content below at full width with `px-4 py-4` page padding. The drawer is the only nav. Theme toggle is NOT in the shell - it lives in `/settings`.
- **Desktop (≥ md)**: a fixed right-side sidebar pinned to the viewport edge (`md:fixed md:inset-y-0 md:start-0 md:w-64`, `border-e` for the divider). Main content is offset with `md:ms-64` so it never sits under the sidebar, and gets `md:px-8 md:py-8` page padding. The sidebar holds the brand at top, vertical `SidebarNav` (links rendered one per row, full-width clickable, `aria-current="page"` for the active route), and pins the user menu to the bottom via `mt-auto`. RTL-correct because `start` resolves to the right side under `dir="rtl"`. Theme toggle does NOT live in the sidebar - it lives in `/settings`.

The shell is intentionally "fixed" and not "sticky": with sticky-in-grid the cell can grow with content and scrolling math gets fiddly, while a fixed sidebar plus a margin offset on main is the standard admin pattern and survives any page height. The sidebar uses `md:overflow-y-auto` so its own contents scroll if the nav ever exceeds viewport height.

#### Per-page width policy

The shell is full-bleed, and **content is NOT centered with `mx-auto`** - it pins to the start side (right in RTL) so reading begins where the eye lands first. Wide pages (matches, settings) fill the available width so cards have room to breathe; narrow pages (filters form) cap at `max-w-2xl` for readability but still anchor to the start side, never centered.

| Route                       | Inner width                    | Why                                                                     |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `/matches`, `/matches/[id]` | `w-full` (no cap)              | Inbox feed needs every pixel; detail page has map + extracted fields.   |
| `/settings`                 | `w-full` (no cap)              | Multi-card grid + embedded notifications form scale with viewport.      |
| `/filters`                  | `w-full max-w-2xl` (RTL-start) | Form reads better narrow but still hugs the right edge, never centered. |

Pre-onboarding `/onboarding` lives in the parent `(app)` shell, which keeps a centered `max-w-3xl` column - the wizard is a single conversation and the only place where `mx-auto` is fine because there is no surrounding chrome to anchor against.

#### Responsive page layouts

Pages are mobile-first single-column stacks that promote to multi-column grids on desktop. The stack gap is `gap-4 sm:gap-6`. The most common patterns:

- **Hero-then-grid** (e.g. matches dashboard pattern): full-width header, then `md:grid md:grid-cols-[2fr_1fr]` for a wide main column (actions, recent matches) and a narrower aside (status). The aside uses `<aside>` semantics, not just a sidebar visual.
- **Symmetric card grid** (`/settings`): `lg:grid-cols-2` (NOT `md:grid-cols-2`) for compact paired cards (account + theme). At md the sidebar already eats 16rem of the viewport, so splitting cards into two columns there crushes them; cards stay full-width until lg+. Full-width sections below for embedded forms (notifications) and one-off actions (restart onboarding).
- **Single-column form** (`/filters`): no breakpoint switch; the form stays linear at `max-w-2xl` regardless of viewport. Sections inside a form may use `sm:grid-cols-2` for tightly paired inputs (e.g. min/max price).

Don't introduce three-column layouts in the main pane - the fixed sidebar already counts as one column visually, so a 3-col grid inside main reads as four total and crowds quickly.

### Login (`/login`)

Full-screen centered `max-w-md` card. The login layout is intentionally distinct from both the landing and the app shell - it's a transition surface.

## Accessibility

- Skip-link at the root layout (`دلگ לתוכן` → `#main-content`).
- All interactive elements have `focus-visible:ring-2 focus-visible:ring-ring`.
- Decorative SVGs use `aria-hidden="true"`. Live regions (chat) use `role="log" aria-live="polite"`.
- Color contrast: foreground/background pairs all clear WCAG AA in both themes.
- `prefers-color-scheme` is honored on first visit; explicit toggle wins after that.

## File map

```
apps/web/
├── app/
│   ├── globals.css                  # OKLch tokens, dark mode
│   ├── layout.tsx                   # RTL root, theme init script
│   ├── page.tsx                     # Public landing (auth-aware CTAs)
│   ├── _landing/                    # Private folder - landing components
│   │   ├── flow-diagram.tsx         # Animated SVG sources → AI → destinations
│   │   ├── brand-icons.tsx          # Custom brand SVG marks
│   │   ├── ai-extractor.tsx         # Animated extractor demo
│   │   └── chat-preview.tsx         # Scripted onboarding preview
│   ├── (app)/                       # Authenticated routes
│   │   ├── layout.tsx               # Minimal brand-only shell (used by /onboarding)
│   │   ├── nav-links.tsx            # `links`, `HeaderBrandLink`, `SidebarNav`
│   │   ├── mobile-nav.tsx           # Hamburger drawer (mobile)
│   │   ├── user-menu.tsx            # Avatar + dropdown
│   │   ├── onboarding/              # First-run chat wizard (no nav)
│   │   │   ├── page.tsx             # Centered shell + skip-to-manual button
│   │   │   ├── chat-ui.tsx          # Real AI onboarding chat
│   │   │   └── skip.action.ts       # markOnboarded then redirect to /filters
│   │   └── (onboarded)/             # Admin shell - gates onboardedAt
│   │       ├── layout.tsx           # Fixed sidebar (md+) + mobile top bar
│   │       ├── matches/page.tsx     # Home: inbox feed (placeholder for now)
│   │       ├── filters/             # Search criteria editor (תנאים)
│   │       ├── settings/            # Account, theme, notifications, restart
│   │       ├── notifications/       # Form lives here, page.tsx redirects to /settings#notifications
│   │       └── dashboard/page.tsx   # Redirect to /matches (legacy bookmarks)
│   └── login/                       # Email OTP + Google OAuth
└── src/
    ├── components/ui/               # Button, Card, Input, Spinner, ThemeToggle, …
    └── lib/utils.ts                 # cn(), formatNis(), relTime()
```

## What this design is NOT

- Not a flashy SaaS landing. No floating cards, no parallax, no 3D, no gradients - anywhere. Surfaces are flat, accents are solid.
- Not a "just shadcn defaults" look - colors are slightly warmer (OKLch-derived), borders are slightly softer, the AI accent is one specific blue-violet that appears nowhere else.
- Not LTR-with-RTL-bolted-on. The visual hierarchy reads right-to-left throughout, including the chat bubble alignment and the flow diagram's vertical composition.
