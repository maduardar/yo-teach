# Lingua Flow

This project stays on its existing Vite + React stack and is configured for Vercel deployment.

## Local development

```bash
npm install
npm run dev
```

## Backend setup

The repo now includes a minimal backend foundation for MVP work:

- Prisma schema: `prisma/schema.prisma`
- Seed script: `prisma/seed.ts`
- Server Prisma client: `src/server/db.ts`
- Typed exercise payload helpers: `src/server/homework-payloads.ts`
- Vercel API example: `api/health.ts`

### Environment

Copy `.env.example` to `.env` and point `DATABASE_URL` at a PostgreSQL database.

### Prisma commands

```bash
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run db:studio
```

## Production build

```bash
npm run build
```

## Deploying to Vercel

Vercel detects Vite automatically. The repo includes a [`vercel.json`](./vercel.json) configuration that preserves `/api/*` functions and rewrites SPA routes such as `/teacher/groups` and `/student/progress` to `index.html` on direct visits and refreshes.
