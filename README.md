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
