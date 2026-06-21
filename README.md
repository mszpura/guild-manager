# Guild Manager — system zarządzania stowarzyszeniem

Webowa aplikacja do zarządzania stowarzyszeniem: członkowie, role, protokoły ze
spotkań i uchwały. Multi-tenant — każdy użytkownik może założyć własne
stowarzyszenie, dodawać członków i nadawać im role.

## Stack

- **Next.js 16** (App Router) + TypeScript + React 19
- **Tailwind CSS v4** + shadcn/ui
- **PostgreSQL** + **Prisma 7** (z driver adapterem `@prisma/adapter-pg`)
- **Auth.js v5** — logowanie przez Google oraz magic link (e-mail)
- **Zod** — walidacja

## Status

Krok 1 (fundament) ukończony: scaffold, model danych z multi-tenancy,
uwierzytelnianie, tworzenie/przełączanie stowarzyszeń, szkielet UI (pulpit).
Kolejne kroki: członkowie → spotkania/protokoły → uchwały (z eksportem PDF).

## Uruchomienie lokalne

1. **Zmienne środowiskowe** — skopiuj `.env.example` do `.env` i uzupełnij:

   ```bash
   cp .env.example .env
   npx auth secret   # wygeneruje i wpisze AUTH_SECRET
   ```

   - `DATABASE_URL` — dla lokalnej bazy (poniżej) zostaw domyślne.
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — z Google Cloud Console
     (redirect URI: `http://localhost:3000/api/auth/callback/google`).
   - `EMAIL_SERVER` / `EMAIL_FROM` — np. darmowy Mailtrap do testów magic linku.

2. **Baza danych** (lokalnie przez Docker):

   ```bash
   docker compose up -d
   ```

   Albo użyj darmowej bazy z [Neon](https://neon.tech) i wklej jej connection
   string do `DATABASE_URL`.

3. **Migracje i klient Prisma**:

   ```bash
   npx prisma migrate dev   # tworzy tabele
   ```

4. **Serwer deweloperski**:

   ```bash
   npm run dev
   ```

   Otwórz http://localhost:3000 — zostaniesz przekierowany do logowania.
   Po zalogowaniu utworzysz pierwsze stowarzyszenie.

## Przydatne komendy

```bash
npm run dev          # serwer deweloperski
npm run build        # build produkcyjny (typecheck)
npm run lint         # ESLint
npx prisma studio    # przeglądarka bazy danych
npx prisma migrate dev --name <nazwa>   # nowa migracja po zmianie schematu
```

## Wdrożenie na DigitalOcean (App Platform + Managed PostgreSQL)

Konfiguracja jest w [`.do/app.yaml`](.do/app.yaml) — definiuje usługę web
(Next.js), job uruchamiający migracje przed każdym wdrożeniem oraz zarządzaną
bazę PostgreSQL. `DATABASE_URL` i `AUTH_URL` podpinają się automatycznie.

1. **Push do GitHub** (App Platform deployuje z repo `mszpura/guild-manager`,
   gałąź `main`, automatycznie przy każdym push).

2. **Utwórz aplikację** ze specyfikacji:

   ```bash
   doctl apps create --spec .do/app.yaml
   ```

   lub w panelu: **Apps → Create → Import from App Spec**.

3. **Uzupełnij sekrety** w panelu (Settings → Env Vars), zaznaczone w spec jako
   `USTAW_W_PANELU`:
   - `AUTH_SECRET` — `npx auth secret` lub `openssl rand -base64 32`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - `EMAIL_SERVER`, `EMAIL_FROM`

4. **Google OAuth** — w Google Cloud Console dodaj produkcyjny redirect URI:
   `https://<twoja-domena>.ondigitalocean.app/api/auth/callback/google`.

Migracje (`prisma migrate deploy`) wykonują się automatycznie jako job
PRE_DEPLOY. Klient Prisma regeneruje się na buildzie przez `postinstall`
(katalog `src/generated/prisma` jest w `.gitignore`).

> Lokalny dev na Dockerze i produkcja na DO to osobne środowiska korzystające
> z tych samych migracji w `prisma/migrations/`.

## Struktura

```
prisma/schema.prisma          model danych (User/Auth.js + Organization/Membership/Role)
src/lib/prisma.ts             singleton Prisma Client (adapter pg)
src/lib/auth.ts               konfiguracja Auth.js (Google + magic link)
src/lib/tenant.ts             getActiveOrg, requireMembership (dostęp tenant-scoped)
src/lib/actions/              server actions (organization, auth)
src/app/(app)/                trasy chronione (layout = bramka sesji + sidebar)
src/app/organizations/new/    tworzenie stowarzyszenia
src/app/(auth)/signin/        logowanie
```
