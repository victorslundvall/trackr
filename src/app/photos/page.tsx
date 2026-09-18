"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, Columns2, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { PageSkeleton, Sheet, spring } from "@/components/motion";
import { dateLabel } from "@/lib/format";
import { uuid } from "@/lib/offline";

type Photo = { id: string; taken_on: string; path: string; note: string | null; url?: string };
const BUCKET = "progress-photos";

/** Downscale to max 1600 px and re-encode as JPEG (also strips EXIF/location). */
async function prepare(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function PhotosPage() {
  const sb = supabase();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState<{ file: File; date: string; note: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<Photo | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [compare, setCompare] = useState<[Photo, Photo] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("progress_photos").select("id,taken_on,path,note").order("taken_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) return setErr(error.message);
    const list = (data ?? []) as Photo[];
    if (list.length) {
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(list.map((p) => p.path), 3600);
      const m = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      list.forEach((p) => (p.url = m.get(p.path) ?? undefined));
    }
    setPhotos(list);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!uploading) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: u } = await sb.auth.getUser();
      for (const item of uploading) {
        const blob = await prepare(item.file);
        const path = `${u.user!.id}/${uuid()}.jpg`;
        const { error: e1 } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (e1) throw e1;
        const { error: e2 } = await sb.from("progress_photos").insert({ taken_on: item.date, path, note: item.note || null });
        if (e2) throw e2;
      }
      setUploading(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Photo) {
    setView(null);
    setPhotos((l) => l?.filter((x) => x.id !== p.id) ?? null);
    await sb.storage.from(BUCKET).remove([p.path]);
    await sb.from("progress_photos").delete().eq("id", p.id);
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  }

  const months = new Map<string, Photo[]>();
  (photos ?? []).forEach((p) => {
    const k = p.taken_on.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), p]);
  });

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/more" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1 flex-1">Progressbilder</h1>
        {(photos?.length ?? 0) >= 2 && (
          <button
            className={`btn px-3 ${selecting ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setSelecting(!selecting);
              setPicked([]);
            }}
          >
            <Columns2 size={16} /> {selecting ? "Klar" : "Jämför"}
          </button>
        )}
      </div>

      <AnimatePresence>
        {selecting && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
              <span className="text-ink-2">Välj två bilder ({picked.length}/2)</span>
              <button
                className="btn-primary px-3 py-2"
                disabled={picked.length !== 2}
                onClick={() => {
                  const [a, b] = picked.map((id) => photos!.find((p) => p.id === id)!).sort((x, y) => x.taken_on.localeCompare(y.taken_on));
                  setCompare([a, b]);
                }}
              >
                Jämför
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button className="btn-outline w-full py-3.5" onClick={() => input.current?.click()}>
        <ImagePlus size={18} /> Lägg till bilder
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) setUploading(files.map((f) => ({ file: f, date: isoDay(new Date(f.lastModified || Date.now())), note: "" })));
          e.target.value = "";
        }}
      />
      {err && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}

      {!photos ? (
        <PageSkeleton rows={2} />
      ) : photos.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-3">
          Inga bilder ännu. Ta bilder i samma ljus och vinkel var 2–4 vecka så blir jämförelsen rättvis.
          <div className="mt-2 text-xs">Bilderna sparas privat – bara du kan se dem.</div>
        </div>
      ) : (
        [...months.entries()].map(([m, list]) => (
          <section key={m}>
            <h2 className="eyebrow mb-2">{dateLabel(`${m}-01`, { month: "long", year: "numeric" })}</h2>
            <div className="stagger grid grid-cols-3 gap-1.5">
              {list.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => (selecting ? togglePick(p.id) : setView(p))}
                    className={`relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-2 ring-2 transition ${on ? "ring-accent" : "ring-transparent"}`}
                  >
                    {p.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" loading="lazy" className={`h-full w-full object-cover transition ${selecting && !on ? "opacity-60" : ""}`} />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">
                      {dateLabel(p.taken_on, { day: "numeric", month: "short" })}
                    </span>
                    {on && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink">
                        <Check size={14} strokeWidth={3} />
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {/* upload sheet */}
      <Sheet open={!!uploading} onClose={() => !busy && setUploading(null)} className="max-h-[88dvh] max-w-md overflow-y-auto">
        <h2 className="text-lg font-bold">Ladda upp {uploading?.length === 1 ? "bild" : `${uploading?.length} bilder`}</h2>
        <ul className="mt-3 space-y-3">
          {uploading?.map((u, i) => (
            <li key={i} className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(u.file)} alt="" className="h-24 w-18 shrink-0 rounded-lg object-cover" />
              <div className="flex-1 space-y-2">
                <input
                  type="date"
                  className="input py-2 text-sm"
                  value={u.date}
                  onChange={(e) => setUploading((l) => l!.map((x, k) => (k === i ? { ...x, date: e.target.value } : x)))}
                />
                <input
                  className="input py-2 text-sm"
                  placeholder="Notering (valfritt)"
                  value={u.note}
                  onChange={(e) => setUploading((l) => l!.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))}
                />
              </div>
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-4 w-full py-3.5" onClick={upload} disabled={busy}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : "Spara"}
        </button>
      </Sheet>

      {/* single photo */}
      <AnimatePresence>
        {view && (
          <motion.div className="fixed inset-0 z-50 flex flex-col bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button className="btn-ghost px-2.5" onClick={() => setView(null)} aria-label="Stäng">
                <X size={18} />
              </button>
              <div className="flex-1 text-center">
                <div className="font-semibold">{dateLabel(view.taken_on, { day: "numeric", month: "long", year: "numeric" })}</div>
                {view.note && <div className="text-xs text-ink-3">{view.note}</div>}
              </div>
              <button className="btn-danger px-2.5" onClick={() => remove(view)} aria-label="Radera">
                <Trash2 size={16} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring} src={view.url} alt="" className="min-h-0 flex-1 object-contain" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* compare */}
      <AnimatePresence>
        {compare && <Compare a={compare[0]} b={compare[1]} onClose={() => setCompare(null)} />}
      </AnimatePresence>
    </main>
  );
}

function Compare({ a, b, onClose }: { a: Photo; b: Photo; onClose: () => void }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (x: number) => {
    const r = box.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)));
  };
  const days = Math.round((new Date(b.taken_on).getTime() - new Date(a.taken_on).getTime()) / 864e5);
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button className="btn-ghost px-2.5" onClick={onClose} aria-label="Stäng">
          <X size={18} />
        </button>
        <div className="flex-1 text-center text-sm">
          <span className="font-semibold">{days} dagar</span> <span className="text-ink-3">mellan bilderna</span>
        </div>
        <div className="w-10" />
      </div>
      <div
        ref={box}
        className="relative mx-auto min-h-0 w-full max-w-xl flex-1 touch-none select-none overflow-hidden"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && move(e.clientX)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -ml-px w-0.5 bg-accent shadow-[0_0_12px_var(--color-accent)]" />
          <div className="absolute top-1/2 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg">
            <Columns2 size={18} />
          </div>
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {dateLabel(a.taken_on, { day: "numeric", month: "short", year: "2-digit" })}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {dateLabel(b.taken_on, { day: "numeric", month: "short", year: "2-digit" })}
        </span>
      </div>
      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-xs text-ink-3">Dra för att jämföra</p>
    </motion.div>
  );
}
