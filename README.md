# JARVIS Calories

JARVIS Calories is a mobile-first AI calorie tracking web app built with Next.js App Router, TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL, OpenAI, and Zod.

## What this app does

- Tracks calorie entries from natural-language chat
- Stores nutrition entries in PostgreSQL through Prisma
- Lets you edit and delete logged foods
- Keeps a daily goal in the UI for now
- Imports custom food menus from JSON, CSV, and plain text
- Includes built-in nutrition catalog matching for common foods and Chipotle ingredients

## Tech stack

- Next.js App Router
- TypeScript (strict)
- Tailwind CSS
- Prisma ORM
- PostgreSQL (recommended: Supabase)
- OpenAI API
- Zod
- Lucide React

## Environment variables

Create `.env.local` in the project root with:

```env
DATABASE_URL=
DIRECT_URL=
OPENAI_API_KEY=
```

`.env.example` contains the same keys with empty values.

## Beginner-friendly Supabase setup

1. Create a Supabase account at https://supabase.com.
2. Create a new project.
3. Wait until the database is fully provisioned.
4. In Supabase, open Project Settings.
5. Open Database.
6. Find the connection strings section.
7. Copy the Prisma connection string into `DATABASE_URL` in `.env.local`.
8. Copy the direct connection string into `DIRECT_URL` in `.env.local`.
9. Copy your OpenAI API key into `OPENAI_API_KEY` in `.env.local`.

Use this file:

```env
DATABASE_URL=paste-your-supabase-prisma-url-here
DIRECT_URL=paste-your-supabase-direct-url-here
OPENAI_API_KEY=paste-your-openai-api-key-here
```

Notes:

- `DATABASE_URL` is used by Prisma Client.
- `DIRECT_URL` is used by Prisma Migrate.
- Keep all three values secret.
- Do not expose them with `NEXT_PUBLIC_`.

## Prisma models included

The Prisma schema includes these models:

- `User`
- `NutritionEntry`
- `NutritionGoal`
- `FoodCatalogItem`
- `GymEntry`
- `GymSchedule`
- `WaterEntry`
- `StepEntry`
- `Task`
- `ChatMessage`
- `UserSettings`

Schema file:

- `prisma/schema.prisma`

## Prisma files added

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/lib/prisma.ts`
- `src/server/db-user.ts`

## Install and run

1. Install dependencies:

```bash
npm install
```

2. Generate the Prisma client:

```bash
npx prisma generate
```

3. Run the first migration after you fill in `.env.local`:

```bash
npx prisma migrate dev --name initial_schema
```

4. Seed the database:

```bash
npx prisma db seed
```

5. Start the app:

```bash
npm run dev
```

## Useful commands

```bash
npm run typecheck
npm run lint
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
```

## How Prisma is used in this app

- Nutrition entries are stored in PostgreSQL with Prisma queries.
- The old Base44 layer has been removed.
- The app uses a safe Prisma singleton in `src/lib/prisma.ts`.
- The current app uses a default demo user record until you add authentication.
- Food catalog seed data is loaded from `src/data/nutrition-catalog.ts` into `FoodCatalogItem`.

## Current behavior preserved

- Chat-based calorie logging
- Daily totals and today filtering
- Edit and delete entry flow
- Suggested prompts
- Custom menu import UI
- Nutrition alias matching and quantity parsing
- OpenAI structured action parsing

## Current limitations

- If `DATABASE_URL` and `DIRECT_URL` are not set, Prisma-backed API routes return a readable configuration error.
- The UI still stores chat history and the daily goal in localStorage.
- Authentication is not implemented yet, so the app uses a default demo user row for now.
- PDF and image menu extraction are not implemented yet.

## Planned next upgrades

- Supabase Auth integration
- Persisting chat history in the `ChatMessage` table
- Calendar and analytics screens for gym, water, steps, and tasks
- PDF and image menu import
