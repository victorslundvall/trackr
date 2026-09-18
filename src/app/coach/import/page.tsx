"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileUp, Loader2 } from "lucide-react";

const MAX_BYTES = 3 * 1024 * 1024; // Vercel limits request bodies to ~4.5 MB; base64 adds ~33 %

async function toBase64(f: File) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function spreadsheetToText(f: File) {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(f);
  return sheets
    .map((s) => `## Blad: ${s.sheet}\n` + s.data.map((row) => row.map((c) => (c == null ? "" : String(c))).join(" | ")).join("\n"))
    .join("\n\n");
}

export default function ImportProgramPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(payload: { filename: string; mediaType: string; data?: string; text?: string }) {
    setErr(null);
    setBusy("Coachen läser programmet…");
    try {
      const res = await fetch("/api/coach/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || !j.chatId) throw new Error(j.error ?? `HTTP ${res.status}`);
      router.push(`/coach/${j.chatId}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  async function onFile(f: File) {
    setErr(null);
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx")) {
        setBusy("Läser kalkylarket…");
        return send({ filename: f.name, mediaType: "text/plain", text: await spreadsheetToText(f) });
      }
      if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv") || name.endsWith(".md")) {
        return send({ filename: f.name, mediaType: "text/plain", text: await f.text() });
      }
      if (name.endsWith(".xls") || name.endsWith(".numbers") || name.endsWith(".ods")) {
        return setErr("Spara kalkylarket som .xlsx eller .csv först (Arkiv → Exportera).");
      }
      const type = f.type || (name.endsWith(".pdf") ? "application/pdf" : "");
      if (!(type === "application/pdf" || type.startsWith("image/"))) return setErr("Filtypen stöds inte. Använd PDF, bild (JPG/PNG), .xlsx, .csv eller text.");
      if (type === "image/heic" || name.endsWith(".heic")) return setErr("HEIC stöds inte – ta en skärmdump eller exportera som JPG.");
      if (f.size > MAX_BYTES) return setErr(`Filen är för stor (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 3 MB – komprimera PDF:en eller ta en skärmdump.`);
      setBusy("Laddar upp…");
      return send({ filename: f.name, mediaType: type, data: await toBase64(f) });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/coach" className="btn-ghost px-2.5" aria-label="Tillbaka">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="h1">Importera program</h1>
      </div>
      <p className="text-sm text-ink-2">
        Ladda upp ett program från en PT, en app eller internet. Coachen läser in det troget – den ändrar inte upplägget. Du granskar resultatet och kan be om ändringar innan du sparar.
      </p>

      {busy ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <p className="text-sm text-ink-2">{busy}</p>
          <p className="text-xs text-ink-3">Det kan ta upp till en minut för stora program.</p>
        </div>
      ) : (
        <>
          <label className="card flex cursor-pointer flex-col items-center gap-3 border-dashed p-8 text-center hover:border-accent">
            <FileUp size={28} className="text-accent" />
            <span className="font-semibold">Välj fil</span>
            <span className="text-xs text-ink-3">PDF, bild (JPG/PNG), kalkylark (.xlsx/.csv) eller textfil · max 3 MB</span>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp,.xlsx,.csv,.tsv,.txt,.md"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>

          <div className="card space-y-3 p-4">
            <label className="label" htmlFor="paste">Eller klistra in text</label>
            <textarea
              id="paste"
              className="input min-h-40 text-sm"
              placeholder={"Pass A – Push\nBänkpress 4x6-8\nLutande hantelpress 3x8-12\n…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn-primary w-full" disabled={!text.trim()} onClick={() => send({ filename: "inklistrad text", mediaType: "text/plain", text })}>
              Läs in
            </button>
          </div>
        </>
      )}
      {err && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
    </main>
  );
}
