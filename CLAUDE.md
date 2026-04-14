# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lingua Flow — a language teaching platform with teacher and student portals. Teachers create groups, log lessons (grammar, vocab, student mistakes), generate AI-powered homework, and track analytics. Students complete homework, review weak points, and do spaced-repetition revision.

## Commands

```bash
npm run dev              # Start both API server and Vite dev server concurrently
npm run dev:web          # Vite frontend only (port 8080)
npm run dev:api          # Express API server only (port 3001, via tsx watch)
npm run build            # Production build
npm run lint             # ESLint
npm run test             # Vitest (single run)
npm run test:watch       # Vitest (watch mode)

# Database (requires DATABASE_URL in .env pointing to PostgreSQL)
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Create/apply migration (append -- --name <name>)
npm run db:push          # Push schema without migration
npm run db:seed          # Seed database (runs tsx prisma/seed.ts)
npm run db:studio        # Prisma Studio GUI
```

## Architecture

### Frontend (React + Vite)

- **Entry:** `src/main.tsx` → `src/App.tsx` (routes)
- **Path alias:** `@/` maps to `src/`
- **Routing:** React Router v6. Two layout shells:
  - `/teacher/*` — `TeacherLayout` with nested pages in `src/pages/teacher/`
  - `/student/*` — `StudentLayout` with nested pages in `src/pages/student/`
  - `/invite/:token` — student invitation activation
- **State:** React Query (`@tanstack/react-query`) for server state; `HomeworkContext` (`src/context/HomeworkContext.tsx`) as the main app context providing auth session, data fetching, and mutations
- **UI:** shadcn/ui components in `src/components/ui/` (do not edit directly), Tailwind CSS, Lucide icons
- **API client:** `src/lib/api.ts` — `apiRequest<T>()` wrapper around fetch

### Backend (Vercel Functions + Express local dev)

- **Production:** Vercel serverless functions in `api/` directory (file-based routing, `@vercel/node` types)
- **Local dev:** `src/server/local-api.ts` — Express server on port 3001; Vite proxies `/api` to it
- **Shared server code:** `src/server/` — database client, auth, error handling, homework generation
- **API helpers:** `src/server/vercel-api.ts` — `ensureMethod()`, `handleApiError()`, `getRequiredSession()`
- **Auth:** HMAC-signed session cookies (`src/server/auth-session.ts`), supports local passwords + Google/Yandex OAuth

### Database (Prisma + PostgreSQL)

- **Schema:** `prisma/schema.prisma`
- **Config:** `prisma.config.ts` (sets migration path, seed command, datasource URL)
- **Generated client:** output to `src/generated/prisma/` (imported as `../generated/prisma/client`)
- **Adapter:** Uses `@prisma/adapter-pg` (PrismaPg) for the PostgreSQL driver
- **Default local DB:** `postgresql://postgres:postgres@localhost:5432/lingua_flow`

### Homework Generation

AI-powered homework generation pipeline:
- **Models:** `src/lib/homework-generation-models.ts` — model selection
- **Schemas:** `src/server/homework-generation-schemas.ts` — Zod schemas for generation context/output
- **Payloads:** `src/server/homework-payloads.ts` — per-exercise-type payload builders (GAP_FILL, MULTIPLE_CHOICE, MATCHING, etc.)
- **Provider:** `src/server/homework-generation-provider.ts` — provider interface for AI generation
- **Service:** `src/server/homework-generation-service.ts` — orchestrates generation flow
- **Jobs:** `src/server/homework-generation-jobs.ts` — async job tracking for generation

### Deployment

- Deployed on Vercel. `vercel.json` rewrites `/api/*` to serverless functions and all other routes to `index.html` (SPA fallback).
