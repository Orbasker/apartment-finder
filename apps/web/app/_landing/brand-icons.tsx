import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

type MarkProps = { className?: string };

export function Yad2Mark({ className }: MarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-xl bg-brand-yad2",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://assets.yad2.co.il/yad2site/y2assets/images/header/yad2Logo.png"
        alt="Yad2"
        className="h-[70%] w-[70%] object-contain"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

export function FacebookMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="var(--color-brand-facebook)" />
      <path
        fill="currentColor"
        className="text-white"
        d="M28.7 25.5h-3.4V36h-4.4V25.5h-2.5v-3.7h2.5v-2.4c0-2 .9-5 5-5h3.7v3.6h-2.7c-.4 0-1.1.2-1.1 1.2v2.6h3.8l-.9 3.7Z"
      />
    </svg>
  );
}

export function MadlanMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="var(--color-brand-madlan)" />
      <g transform="translate(12 12)">
        <path
          fill="var(--color-brand-madlan-leaf)"
          fillRule="evenodd"
          d="M20.944 8.825l.037-.172c.02-.093-.09-.16-.164-.098l-7.28 6.096 2.731 2.271 3.242-2.72c.22-.185.378-.45.441-.746l.993-4.631zM11.417 20.88a.105.105 0 0 0 .135 0l3.7-3.105a.081.081 0 0 0 0-.125l-7.62-6.337a.105.105 0 0 0-.134 0l-3.672 3.071a.082.082 0 0 0 0 .125l7.591 6.37zM2.091 8.813l.94 4.657 7.42-6.204a.082.082 0 0 0 0-.125L6.86 4.128a.105.105 0 0 0-.135 0L2.443 7.75a1.115 1.115 0 0 0-.352 1.063zm14.152-4.695a.105.105 0 0 0-.134 0l-7.525 6.288a.082.082 0 0 0 0 .125l3.94 3.277a.105.105 0 0 0 .135 0l7.511-6.29a.081.081 0 0 0 0-.125l-3.927-3.275zm5.676 2.048a3.147 3.147 0 0 1 1.048 3.089l-.993 4.631a3.41 3.41 0 0 1-1.131 1.891l-8.03 6.739a2.062 2.062 0 0 1-2.656 0l-8.018-6.728A3.407 3.407 0 0 1 1 13.855L.065 9.22c-.23-1.137.17-2.301 1.04-3.038l4.35-3.68a2.067 2.067 0 0 1 2.67-.005l3.325 2.79 3.41-2.81a2.073 2.073 0 0 1 2.644.007l4.416 3.683z"
        />
      </g>
    </svg>
  );
}

export function EmailMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="var(--color-brand-email)" />
      <path
        fill="none"
        stroke="currentColor"
        className="text-white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 17h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V19a2 2 0 0 1 2-2Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        className="text-white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 19 12 8 12-8"
      />
    </svg>
  );
}

export function WhatsappMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="var(--color-brand-whatsapp)" />
      <path
        fill="currentColor"
        className="text-white"
        transform="translate(12 12)"
        d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.595 5.526l.275.437-1.025 3.74 3.844-1.005zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413Z"
      />
    </svg>
  );
}

export function TelegramMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="12" fill="var(--color-brand-telegram)" />
      <path
        fill="currentColor"
        className="text-white"
        transform="translate(12 12)"
        d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.7L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
      />
    </svg>
  );
}

export function BrainMark({ className }: MarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm ring-8 ring-accent/10",
        className,
      )}
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-accent/25" />
      <Brain className="h-1/2 w-1/2" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
