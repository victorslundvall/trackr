"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Camera,
  Check,
  CloudOff,
  Disc3,
  FileUp,
  Gauge,
  Link2,
  Moon,
  Pin,
  Ruler,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Logo, { LogoMark } from "@/components/Logo";
import MuscleMap from "@/components/MuscleMap";
import Heatmap from "@/components/Heatmap";
import { LineChart } from "@/components/Charts";
import { CountUp, TypingDots, spring } from "@/components/motion";
import { DEFAULT_PRINCIPLES, EVIDENCE_LABEL, type Principle } from "@/lib/coach/knowledge";
import { CoachScreen, DEMO_MUSCLES, HomeScreen, LoggerScreen, Phone } from "./Phone";

const EASE = [0.16, 1, 0.3, 1] as const;
const SIGNUP = "/login?mode=up";

export default function Landing() {
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 200, damping: 40 });
  return (
    <div className="relative overflow-x-clip">
      <motion.div className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-accent shadow-[0_0_12px_var(--color-accent)]" style={{ scaleX: bar }} />
      <TopBar />
      <Hero />
      <Marquee />
      <Numbers />
      <CoachSection />
      <ProgressionSection />
      <StatsSection />
      <FeatureGrid />
      <HowItWorks />
      <Philosophy />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ------------------------------------------------------------------ top bar

function TopBar() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useEffect(() => scrollY.on("change", (v) => setSolid(v > 24)), [scrollY]);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background,border-color,backdrop-filter] duration-300 ${
        solid ? "border-b border-line/70 bg-bg/85 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Trakkr">
          <Logo size={26} />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn px-3 py-2 text-ink-2 hover:text-ink">
            Logga in
          </Link>
          <Link href={SIGNUP} className="btn-primary px-4 py-2">
            Skapa konto
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ hero

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fan = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const groupY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const groupRX = useTransform(scrollYProgress, [0, 1], [8, 26]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const textO = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  // pointer tilt + spotlight
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const tiltY = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 120, damping: 20 });
  const tiltX = useSpring(useTransform(my, [0, 1], [6, -6]), { stiffness: 120, damping: 20 });
  const spotX = useTransform(mx, (v) => `${v * 100}%`);
  const spotY = useTransform(my, (v) => `${v * 100}%`);
  const spot = useMotionTemplate`radial-gradient(38rem 28rem at ${spotX} ${spotY}, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 70%)`;

  const words = ["Progression,", "inte", "gissningar."];

  return (
    <section
      ref={ref}
      className="relative min-h-[100svh] overflow-hidden pt-28"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
    >
      {/* background: grid + drifting aurora + pointer spotlight */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_20%,black_20%,transparent_70%)]" />
      <motion.div
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]"
        animate={{ x: ["-50%", "-44%", "-56%", "-50%"], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute right-[-10rem] top-40 h-[26rem] w-[26rem] rounded-full bg-sky/10 blur-[110px]"
        animate={{ y: [0, 60, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div className="pointer-events-none absolute inset-0" style={{ background: spot }} />

      <motion.div style={{ y: textY, opacity: textO }} className="relative mx-auto max-w-4xl px-5 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs text-ink-2 backdrop-blur"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          Just nu endast via inbjudan
        </motion.div>
        <h1 className="mt-6 text-[clamp(2.6rem,8vw,5.6rem)] font-black leading-[0.95] tracking-[-0.045em]">
          {words.map((w, i) => (
            <motion.span
              key={w}
              className={`mr-[0.22em] inline-block ${i > 0 ? "bg-gradient-to-r from-accent to-[#e6ff9e] bg-clip-text text-transparent" : ""}`}
              initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease: EASE }}
            >
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-2 md:text-xl"
        >
          Trakkr är träningsloggen med en evidensbaserad AI-coach. Den bygger ditt program, säger när det är dags att öka – och visar exakt var din veckovolym hamnar.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease: EASE }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href={SIGNUP} className="btn-primary group px-6 py-3.5 text-base">
            Skapa konto <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/login" className="btn-outline px-6 py-3.5 text-base">
            Logga in
          </Link>
        </motion.div>
      </motion.div>

      {/* phones */}
      <div className="relative mx-auto mt-14 flex h-[560px] max-w-5xl justify-center [perspective:1400px] md:mt-16 md:h-[640px]">
        <motion.div style={{ y: groupY, rotateX: groupRX, rotateY: tiltY, transformStyle: "preserve-3d" }} className="relative h-full w-full">
          <SidePhone side={-1} fan={fan}>
            <CoachScreen />
          </SidePhone>
          <SidePhone side={1} fan={fan}>
            <LoggerScreen />
          </SidePhone>
          <motion.div
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ rotateX: tiltX, transformStyle: "preserve-3d" }}
            initial={{ opacity: 0, y: 120, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
          >
            <div className="absolute -inset-10 -z-10 rounded-full bg-accent/20 blur-3xl" />
            <Phone width={270}>
              <HomeScreen />
            </Phone>
          </motion.div>
        </motion.div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-bg to-transparent" />
      </div>
    </section>
  );
}

function SidePhone({ side, fan, children }: { side: -1 | 1; fan: MotionValue<number>; children: React.ReactNode }) {
  const x = useTransform(fan, [0, 1], [side * 170, side * 250]);
  const rot = useTransform(fan, [0, 1], [side * -16, side * -26]);
  return (
    <motion.div
      className="absolute left-1/2 top-12 hidden sm:block"
      style={{ x, rotateY: rot, translateX: "-50%", z: -140, transformStyle: "preserve-3d" }}
      initial={{ opacity: 0, x: 0 }}
      animate={{ opacity: 0.85 }}
      transition={{ duration: 1.1, delay: 0.55, ease: EASE }}
    >
      <Phone width={240}>{children}</Phone>
    </motion.div>
  );
}

// ------------------------------------------------------------------ marquee

const MARQUEE = ["Dubbel progression", "RIR & RPE", "e1RM-trender", "Supersets", "Offline-loggning", "Muskelkarta", "Dagsform", "Veckorapport", "Blockrapport", "Skivkalkylator", "Progressbilder", "Deload-planering", "PR-tidslinje", "Importera program"];

function Marquee() {
  return (
    <div className="relative border-y border-line/70 bg-surface/40 py-5 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <motion.div className="flex w-max gap-10 whitespace-nowrap text-sm font-medium text-ink-2" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
        {[...MARQUEE, ...MARQUEE].map((m, i) => (
          <span key={i} className="flex items-center gap-10">
            {m}
            <LogoMark size={14} className="text-accent/60" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------ numbers

function Numbers() {
  const items = [
    { n: 25, suffix: "", label: "evidensbaserade principer med källor styr coachen" },
    { n: 1, suffix: " tryck", label: "per set – vikt och reps fylls i från förra passet" },
    { n: 0, suffix: " staplar", label: "täckning behövs – allt loggas offline och synkas sen" },
  ];
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-5 py-20 md:grid-cols-3">
      {items.map((it, i) => (
        <Reveal key={i} delay={i * 0.08}>
          <SpotCard className="h-full p-6">
            <div className="text-5xl font-black tracking-tight text-accent">
              <CountUp value={it.n} duration={1.4} />
              <span className="text-2xl text-ink">{it.suffix}</span>
            </div>
            <p className="mt-2 text-ink-2">{it.label}</p>
          </SpotCard>
        </Reveal>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ shared bits

function Reveal({ children, delay = 0, className, y = 32 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Card with a lime spotlight that follows the pointer. */
function SpotCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const bg = useMotionTemplate`radial-gradient(18rem circle at ${x}px ${y}px, color-mix(in oklab, var(--color-accent) 12%, transparent), transparent 70%)`;
  return (
    <div
      className={`card group relative overflow-hidden ${className ?? ""}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-200);
        y.set(-200);
      }}
    >
      <motion.div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
      <div className="relative">{children}</div>
    </div>
  );
}

function SectionHead({ eyebrow, title, body, icon }: { eyebrow: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div>
      <Reveal>
        <div className="eyebrow flex items-center gap-2 text-accent">
          {icon} {eyebrow}
        </div>
      </Reveal>
      <Reveal delay={0.05}>
        <h2 className="mt-3 text-[clamp(2rem,4.5vw,3.25rem)] font-black leading-[1.02] tracking-[-0.04em]">{title}</h2>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">{body}</p>
      </Reveal>
    </div>
  );
}

function Bullets({ items }: { items: { icon: React.ReactNode; text: string }[] }) {
  return (
    <ul className="mt-8 space-y-3">
      {items.map((b, i) => (
        <Reveal key={i} delay={0.12 + i * 0.06} y={16}>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent ring-1 ring-accent/25">{b.icon}</span>
            <span className="text-ink-2">{b.text}</span>
          </li>
        </Reveal>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ USP 1: coach

function CoachSection() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 md:grid-cols-2 md:gap-16">
      <div>
        <SectionHead
          icon={<Brain size={14} />}
          eyebrow="AI-coach"
          title="En coach som har läst forskningen."
          body="Berätta hur många dagar du vill träna, vad du vill prioritera och vilken utrustning du har. Coachen ställer följdfrågor och bygger ett komplett program – set, reps, RIR och veckoplan – utifrån 25 principer med evidensnivå och källa."
        />
        <Bullets
          items={[
            { icon: <Moon size={15} />, text: "Justerar dagens pass efter sömn, energi, stress och träningsvärk." },
            { icon: <Sparkles size={15} />, text: "Kommenterar varje pass och skriver en veckorapport på söndagar." },
            { icon: <FileUp size={15} />, text: "Läser in befintliga program från PDF, bild eller kalkylark." },
            { icon: <Link2 size={15} />, text: "Ändra programmet genom att bara skriva vad du vill – “byt bänk mot hantelpress”." },
          ]}
        />
      </div>
      <Reveal>
        <ReadinessDemo />
      </Reveal>
    </section>
  );
}

const READY = [
  { k: "Sömn", v: 2, bad: true },
  { k: "Energi", v: 3, bad: false },
  { k: "Träningsvärk", v: 4, bad: true },
  { k: "Stress", v: 2, bad: false },
];

function ReadinessDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setStep((s) => (s >= 7 ? 0 : s + 1)), 900);
    return () => clearInterval(t);
  }, [inView]);
  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-accent/10 blur-3xl" />
      <div className="card p-5">
        <div className="eyebrow text-accent">Dagsform</div>
        <div className="mt-1 text-xl font-bold tracking-tight">Hur känns det inför Upper B?</div>
        <div className="mt-4 space-y-3">
          {READY.map((r, i) => (
            <div key={r.k}>
              <div className="mb-1 text-sm font-medium">{r.k}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => {
                  const on = step > i && v === r.v;
                  return (
                    <div key={v} className={`relative flex h-9 items-center justify-center rounded-xl border text-sm font-semibold ${on ? "border-transparent text-accent-ink" : "border-line bg-surface-2 text-ink-3"}`}>
                      {on && <motion.span layoutId={`rd-${r.k}`} transition={spring} className={`absolute inset-0 rounded-xl ${r.bad ? "bg-warm" : "bg-accent"}`} />}
                      <span className="relative">{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 min-h-[124px]">
          <AnimatePresence mode="wait">
            {step >= 4 && step < 5 && (
              <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-ink-3">
                <TypingDots className="text-accent" /> Coachen planerar…
              </motion.div>
            )}
            {step >= 5 && (
              <motion.div key="p" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-warm/30 bg-warm/[0.06] p-3.5">
                <div className="flex items-center gap-2 font-bold text-warm">↓ Lätta lite idag</div>
                <p className="mt-1 text-sm text-ink-2">Dålig sömn och mycket värk i bröstet. Kör huvudlyften men dra ner ett set och håll vikten.</p>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <span>Incline Bench Press</span>
                  <span className="font-semibold text-accent">3 set · håll vikten</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ USP 2: progression

function ProgressionSection() {
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_20%_50%,color-mix(in_oklab,var(--color-accent)_6%,transparent),transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2 md:gap-16">
        <Reveal className="order-2 md:order-1">
          <ProgressionDemo />
        </Reveal>
        <div className="order-1 md:order-2">
          <SectionHead
            icon={<TrendingUp size={14} />}
            eyebrow="Smart progression"
            title="Vet när det är dags att öka."
            body="Dubbel progression med rep-intervall och RIR. När du når toppen av intervallet föreslår Trakkr nästa vikt – och flaggar övningar som stått still tre pass i rad."
          />
          <Bullets
            items={[
              { icon: <Gauge size={15} />, text: "Trend i beräknat 1RM per övning – i procent per månad." },
              { icon: <TrendingUp size={15} />, text: "Prognos för var du landar om tre månader om trenden håller." },
              { icon: <Trophy size={15} />, text: "Rekordtidslinje och en PR-markering direkt efter passet." },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

const PROG_SETS = [
  [100, 8],
  [100, 8],
  [100, 8],
];

function ProgressionDemo() {
  const [done, setDone] = useState<boolean[]>([true, false, false]);
  const all = done.every(Boolean);
  const points = useMemo(() => {
    const base = Date.UTC(2026, 5, 1);
    return [112, 113.5, 114, 116.5, 117, 119, 120.5, 121, 123.5, 124.5].map((y, i) => ({
      x: base + i * 9 * 864e5,
      y,
      label: `Pass ${i + 1}`,
      value: `${y.toLocaleString("sv-SE")} kg`,
    }));
  }, []);
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-start justify-between px-4 pt-4">
          <div>
            <div className="font-semibold text-accent">Incline Bench Press</div>
            <div className="text-xs text-ink-3">Mål 3 × 6–8 · 2 RIR</div>
          </div>
          <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-ink-3">Prova – tryck på bockarna</span>
        </div>
        <div className="mt-3">
          {PROG_SETS.map(([w, r], i) => (
            <div key={i} className={`grid grid-cols-[2rem_1fr_4rem_3.5rem_2.75rem] items-center gap-x-2 px-3 py-1.5 transition-colors duration-300 ${done[i] ? "bg-accent/[0.07]" : ""}`}>
              <span className="text-center text-sm font-bold text-ink-2">{i + 1}</span>
              <span className="text-sm text-ink-3">100 × 7</span>
              <span className="flex h-9 items-center justify-center rounded-lg bg-surface-2 font-semibold">{w}</span>
              <span className="flex h-9 items-center justify-center rounded-lg bg-surface-2 font-semibold">{r}</span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                animate={done[i] ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                onClick={() => setDone((d) => d.map((x, k) => (k === i ? !x : x)))}
                className={`flex h-9 items-center justify-center rounded-lg transition-colors ${done[i] ? "bg-accent text-accent-ink shadow-[0_0_18px_-4px_var(--color-accent)]" : "bg-surface-2 text-ink-3 hover:text-ink"}`}
                aria-label={`Set ${i + 1}`}
              >
                <Check size={18} strokeWidth={3} />
              </motion.button>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 pt-3">
          <AnimatePresence mode="wait">
            {all ? (
              <motion.div
                key="up"
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 p-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <LogoMark size={20} />
                </span>
                <div className="text-sm">
                  <div className="font-bold text-accent">Redo att höja</div>
                  <div className="text-ink-2">Alla set på toppen av intervallet. Nästa gång: 102,5 kg.</div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-ink-3">
                {done.filter(Boolean).length}/3 set klara – nå 8 reps på alla set så föreslås nästa vikt.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="font-semibold">Beräknat 1RM</div>
          <div className="text-right">
            <span className="text-lg font-bold text-accent">
              +<CountUp value={3.9} decimals={1} />%
            </span>
            <span className="ml-1 text-xs text-ink-3">per mån</span>
          </div>
        </div>
        <LineChart points={points} height={150} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ USP 3: stats

function StatsSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const days = useMemo(() => {
    // deterministic pseudo-random year of training
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out: { day: string; sets: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dow = d.getDay();
      if ([1, 2, 4, 5].includes(dow) ? rnd() < 0.85 : rnd() < 0.12)
        out.push({ day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, sets: 10 + Math.round(rnd() * 16) });
    }
    return out;
  }, []);
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <div className="grid items-end gap-8 md:grid-cols-2">
        <SectionHead
          icon={<Ruler size={14} />}
          eyebrow="Statistik"
          title="Se exakt var volymen hamnar."
          body="Hårda set per muskel och vecka, räknade fraktionellt – mot ett målspann som följer din nivå och dina fokusmuskler. Tryck på en muskel."
        />
        <Reveal delay={0.1}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: days.length, l: "träningsdagar" },
              { v: 41, l: "rekord i år" },
              { v: 12, l: "veckor i rad" },
            ].map((s) => (
              <div key={s.l} className="card p-4 text-center">
                <div className="text-3xl font-black tracking-tight">
                  <CountUp value={s.v} />
                </div>
                <div className="text-xs text-ink-3">{s.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-5">
        <Reveal className="min-w-0 md:col-span-3">
          <div className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Volym denna vecka</div>
              <span className="chip">Avancerad · fokus bröst & axlar</span>
            </div>
            <MuscleMap data={DEMO_MUSCLES} />
          </div>
        </Reveal>
        <div className="min-w-0 space-y-4 md:col-span-2">
          <Reveal delay={0.08}>
            <div className="card p-5">
              <div className="mb-2 font-semibold">Konsistens</div>
              {mounted ? <Heatmap days={days} /> : <div className="skeleton h-28" />}
            </div>
          </Reveal>
          <Reveal delay={0.14}>
            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <Trophy size={16} className="text-accent" /> Rekordtidslinje
              </div>
              <ol className="relative space-y-3 border-l border-line pl-4 text-sm">
                {[
                  ["Knäböj", "e1RM 162 kg", "+4"],
                  ["Incline Bench Press", "e1RM 124,5 kg", "+1"],
                  ["Chins", "e1RM 118 kg", "+2,5"],
                ].map(([a, b, c], i) => (
                  <motion.li
                    key={a}
                    className="relative"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                  >
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)] ring-4 ring-surface" />
                    <div className="font-medium">{a}</div>
                    <div className="text-xs text-ink-2">
                      {b} <span className="text-accent">{c}</span>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ everything else

function FeatureGrid() {
  const items = [
    { icon: <CloudOff size={18} />, t: "Offline-loggning", d: "Logga i källaren utan täckning – allt synkas när nätet kommer tillbaka." },
    { icon: <Link2 size={18} />, t: "Supersets", d: "Koppla ihop övningar; vilotimern startar först efter sista." },
    { icon: <Timer size={18} />, t: "Vilotimer", d: "Startar när du bockar av ett set. Justera med ±15 s." },
    { icon: <Disc3 size={18} />, t: "Skivkalkylator", d: "Se exakt vilka skivor som ska på stången." },
    { icon: <Pin size={18} />, t: "Fasta noteringar", d: "“Säte hål 4” – visas varje gång du kör övningen." },
    { icon: <Camera size={18} />, t: "Progressbilder", d: "Privata bilder med före/efter-reglage." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <Reveal>
        <h2 className="text-center text-[clamp(1.8rem,3.6vw,2.6rem)] font-black tracking-[-0.04em]">Och allt annat en lyftare behöver.</h2>
      </Reveal>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f, i) => (
          <Reveal key={f.t} delay={(i % 3) * 0.06} y={20}>
            <SpotCard className="h-full p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/25 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">{f.icon}</span>
              <div className="mt-4 font-semibold">{f.t}</div>
              <p className="mt-1 text-sm text-ink-2">{f.d}</p>
            </SpotCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const line = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const steps = [
    { t: "Bygg eller importera", d: "Chatta fram ett program med coachen – eller ladda upp det du redan kör som PDF, bild eller kalkylark." },
    { t: "Logga – ett tryck per set", d: "Vikt och reps förifylls från förra passet. Supersets, vilotimer och noteringar finns där du behöver dem." },
    { t: "Följ progressionen", d: "Trakkr säger när det är dags att öka, visar trenden per övning och sammanfattar varje vecka och block." },
  ];
  return (
    <section className="mx-auto max-w-3xl px-5 py-24">
      <Reveal>
        <div className="eyebrow text-center text-accent">Så funkar det</div>
        <h2 className="mt-3 text-center text-[clamp(2rem,4.5vw,3.25rem)] font-black tracking-[-0.04em]">Tre steg. Sen är det bara att lyfta.</h2>
      </Reveal>
      <div ref={ref} className="relative mt-14 pl-14">
        <div className="absolute bottom-2 left-[19px] top-2 w-[2px] rounded-full bg-line" />
        <motion.div className="absolute left-[19px] top-2 w-[2px] origin-top rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" style={{ scaleY: line, bottom: 8 }} />
        <div className="space-y-14">
          {steps.map((s, i) => (
            <Reveal key={s.t} delay={0.05}>
              <div className="relative">
                <span className="absolute -left-14 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-bg font-bold text-accent shadow-[0_0_20px_-6px_var(--color-accent)]">{i + 1}</span>
                <div className="text-2xl font-bold tracking-tight">{s.t}</div>
                <p className="mt-2 text-ink-2">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const PICK = ["vol-dose", "rir-hyp", "load-range", "freq", "rest", "deload"];
const EVIDENCE_STYLE: Record<string, string> = {
  stark: "border-accent/50 bg-accent/10 text-accent",
  måttlig: "border-sky/40 bg-sky/10 text-sky",
  praxis: "border-line text-ink-2",
  egen: "border-warm/40 text-warm",
};

function Philosophy() {
  const list = PICK.map((id) => DEFAULT_PRINCIPLES.find((p) => p.id === id)).filter(Boolean) as Principle[];
  return (
    <section className="relative py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_80%_40%,color-mix(in_oklab,var(--color-sky)_5%,transparent),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <SectionHead
            icon={<BookOpen size={14} />}
            eyebrow="Filosofin"
            title="Byggd på forskning – inte på broscience."
            body="Coachen följer en öppen träningsfilosofi: 25 principer, var och en märkt med evidensnivå och källa. Du kan läsa, ändra och lägga till egna. Den ses över varje kvartal när ny forskning kommer."
          />
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 0.07} y={24}>
              <TiltCard>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{p.section}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${EVIDENCE_STYLE[p.evidence]}`}>{EVIDENCE_LABEL[p.evidence]}</span>
                </div>
                <p className="mt-3 leading-relaxed">{p.text}</p>
                {p.source && <p className="mt-3 text-xs text-ink-3">{p.source}</p>}
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Card that tilts toward the pointer in 3D. */
function TiltCard({ children }: { children: React.ReactNode }) {
  const rx = useSpring(0, { stiffness: 200, damping: 18 });
  const ry = useSpring(0, { stiffness: 200, damping: 18 });
  return (
    <div className="h-full [perspective:900px]">
      <motion.div
        className="card h-full p-5 transition-shadow hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]"
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 10);
          rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------------ CTA + footer

function FinalCta() {
  return (
    <section className="px-5 py-24">
      <Reveal>
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-accent/30 bg-surface p-10 text-center md:p-16">
          <motion.div
            className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-accent/25 blur-[100px]"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative">
            <motion.div initial={{ y: 20, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={spring} className="mx-auto w-fit text-accent">
              <LogoMark size={56} animate />
            </motion.div>
            <h2 className="mt-6 text-[clamp(2rem,5vw,3.5rem)] font-black leading-[1] tracking-[-0.045em]">Har du fått en inbjudan?</h2>
            <p className="mx-auto mt-4 max-w-lg text-lg text-ink-2">Skapa ditt konto på under en minut. Koden finns i länken du fick.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={SIGNUP} className="btn-primary group px-6 py-3.5 text-base">
                Skapa konto <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className="btn-outline px-6 py-3.5 text-base">
                Logga in
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-ink-3 sm:flex-row">
        <Logo size={22} />
        <span>© {new Date().getFullYear()} Trakkr</span>
        <Link href="/login" className="hover:text-ink-2">
          Logga in
        </Link>
      </div>
    </footer>
  );
}
