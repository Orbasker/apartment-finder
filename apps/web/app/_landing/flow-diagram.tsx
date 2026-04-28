import {
  BrainMark,
  EmailMark,
  FacebookMark,
  MadlanMark,
  TelegramMark,
  WhatsappMark,
  Yad2Mark,
} from "./brand-icons";

/**
 * Coordinate system: viewBox 0 0 100 100 with preserveAspectRatio="none".
 * The container is aspect-square so the SVG and the absolutely-positioned
 * icon overlay share the exact same coordinate space (1% in CSS == 1 unit in SVG).
 *
 * Layout (RTL viewport - sources on the right, destinations on the left):
 *   Top row    y≈18:  Facebook(x=15)  Madlan(x=50)  Yad2(x=85)
 *   Brain          :  (x=50, y=50)
 *   Bottom row y≈82:  Telegram(x=15)  WhatsApp(x=50)  Email(x=85)
 *
 * In RTL, `start-[15%]` resolves to right:15% (visual x≈85),
 * `end-[15%]` resolves to left:15% (visual x≈15). Path endpoints below
 * use these visual x values directly.
 */

const TILE = "h-12 w-12 sm:h-14 sm:w-14";

export function FlowDiagram() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="text-foreground/35">
          <path
            id="path-fb-brain"
            d="M 15 25 Q 30 38 50 44"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
          <path
            id="path-md-brain"
            d="M 50 25 L 50 44"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
          <path
            id="path-y2-brain"
            d="M 85 25 Q 70 38 50 44"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
          <path
            id="path-brain-tg"
            d="M 50 56 Q 30 62 15 75"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
          <path
            id="path-brain-wa"
            d="M 50 56 L 50 75"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
          <path
            id="path-brain-em"
            d="M 50 56 Q 70 62 85 75"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.4 1.4"
          />
        </g>

        <g>
          <Particle href="#path-fb-brain" color="var(--color-brand-facebook)" begin="0s" />
          <Particle href="#path-fb-brain" color="var(--color-brand-facebook)" begin="1.2s" />
          <Particle href="#path-md-brain" color="var(--color-brand-madlan-leaf)" begin="0.4s" />
          <Particle href="#path-md-brain" color="var(--color-brand-madlan-leaf)" begin="1.7s" />
          <Particle href="#path-y2-brain" color="var(--color-brand-yad2)" begin="0.2s" />
          <Particle href="#path-y2-brain" color="var(--color-brand-yad2)" begin="1.4s" />
        </g>

        <g>
          <Particle href="#path-brain-tg" color="var(--color-brand-telegram)" begin="1s" />
          <Particle href="#path-brain-wa" color="var(--color-brand-whatsapp)" begin="1.4s" />
          <Particle href="#path-brain-em" color="var(--color-brand-email)" begin="1.8s" />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0">
        <Tile cx={15} cy={18} label="Facebook">
          <FacebookMark className={TILE} />
        </Tile>
        <Tile cx={50} cy={18} label="Madlan">
          <MadlanMark className={TILE} />
        </Tile>
        <Tile cx={85} cy={18} label="Yad2">
          <Yad2Mark className={TILE} />
        </Tile>

        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
          style={{ left: "50%", top: "50%" }}
        >
          <BrainMark className="h-14 w-14 sm:h-16 sm:w-16" />
          <span className="rounded-full border bg-background px-2 py-0.5 text-3xs font-semibold tracking-wide">
            AI
          </span>
        </div>

        <Tile cx={15} cy={82} label="Telegram">
          <TelegramMark className={TILE} />
        </Tile>
        <Tile cx={50} cy={82} label="WhatsApp">
          <WhatsappMark className={TILE} />
        </Tile>
        <Tile cx={85} cy={82} label="אימייל">
          <EmailMark className={TILE} />
        </Tile>
      </div>
    </div>
  );
}

function Tile({
  cx,
  cy,
  label,
  children,
}: {
  cx: number;
  cy: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${cx}%`, top: `${cy}%` }}
    >
      <div className="rounded-xl bg-card p-1 shadow-sm ring-1 ring-border">{children}</div>
      <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-3xs font-medium text-muted-foreground backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

function Particle({ href, color, begin }: { href: string; color: string; begin: string }) {
  return (
    <circle r="1" fill={color}>
      <animateMotion dur="2.5s" repeatCount="indefinite" begin={begin}>
        <mpath href={href} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.1;0.9;1"
        dur="2.5s"
        repeatCount="indefinite"
        begin={begin}
      />
    </circle>
  );
}
