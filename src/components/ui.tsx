import type { ReactNode } from "react";
import type { Side } from "@/lib/types";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>
  );
}

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-ink-light/80 backdrop-blur-sm ${
        hover ? "card-glow transition-all hover:border-accent/30" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-white">
      {children}
    </h2>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-r from-ink-light via-ink to-ink-light">
      <div className="grid-pattern pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <Container className="relative py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            {subtitle && <p className="mt-2 max-w-2xl text-gray-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      </Container>
      <div
        className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        aria-hidden
      />
    </section>
  );
}

const TONES = {
  accent: "bg-accent/10 text-accent border-accent/20",
  ct: "bg-ct/10 text-ct border-ct/20",
  win: "bg-win/10 text-win border-win/20",
  loss: "bg-loss/10 text-loss border-loss/20",
  muted: "bg-white/5 text-gray-400 border-white/10",
} as const;

export function Badge({
  children,
  tone = "muted",
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** CT reads blue and T reads amber, matching the in-game convention. */
export function SideBadge({ side }: { side: Side }) {
  return <Badge tone={side === "CT" ? "ct" : "accent"}>{side}</Badge>;
}

export function StatTile({
  label,
  value,
  hint,
  tone = "white",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "white" | "accent" | "ct";
}) {
  const colour =
    tone === "accent" ? "text-accent" : tone === "ct" ? "text-ct" : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-ink-light/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`font-heading text-2xl font-bold ${colour}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-ink-light/40 px-6 py-12 text-center">
      <p className="font-heading text-lg font-bold uppercase tracking-wide text-gray-300">
        {title}
      </p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-gray-500">{children}</div>}
    </div>
  );
}
