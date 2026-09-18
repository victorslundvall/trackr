# Trackr

Personlig träningslogg (egen variant av StrengthLog). Next.js 16 + Supabase.

## Kom igång

```bash
npm install
npm run dev
```

Öppna http://localhost:3000 och skapa ett konto. `.env.local` innehåller redan projektets URL och publishable key.

> Supabase skickar ett bekräftelsemejl vid registrering. Om länken pekar fel: gå till
> Supabase → Authentication → URL Configuration och sätt *Site URL* till `http://localhost:3000`
> (och senare din Vercel-URL). Vill du slippa mejlet: Authentication → Providers → Email → stäng av *Confirm email*.

## Funktioner (v0.1)

- **Logga pass** – tomt eller från mall. Förra passets siffror visas som placeholder; tryck ✓ så fylls de i. Vilotimer startar automatiskt.
- **Per set:** vikt/reps (eller +kg för kroppsviktsövningar, km/min för kondition), settyp (uppvärmning/drop/failure), RPE, RIR, tempo, vila, anteckning.
- **Mallar** med mål-set, reps, RPE och vila. Spara ett avslutat pass som mall.
- **Historik** med månadskalender.
- **Övningar:** 750+ i biblioteket + egna. Per övning: e1RM-kurva, rekord per repantal, historik, instruktioner.
- **Statistik:** pass/set/volym per vecka, set per muskelgrupp, kroppsvikt.
- **Kroppsmått.**
- **Import från StrengthLog** (CSV) – kan köras om, redan importerade pass hoppas över. Kroppsvikt från kroppsviktsövningar blir viktkurva.

## Struktur

```
src/app/            sidor (App Router, klientkomponenter)
src/components/     ExercisePicker, RestTimer, Charts, Nav
src/lib/            supabase-klient, data-helpers, format, StrengthLog-import + muskelmappning
src/proxy.ts        auth-skydd (Next 16:s ersättare för middleware)
supabase/           info om schema/migreringar
```

## Deploy (Vercel)

Importera repot i Vercel, lägg till `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, och lägg Vercel-URL:en i Supabase → Auth → URL Configuration.

## Nästa steg

- Program med progression (block/veckor, %-av-1RM, RPE-baserat)
- AI: föreslå dagens vikter, generera/justera program, coachchatt
