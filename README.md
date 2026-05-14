# Eurovision Ranking Game

A Next.js app for scoring Eurovision entries against custom criteria, producing a live leaderboard, and saving each user's scorecard with Supabase Auth and Prisma.

## Supabase and Prisma setup

Supabase is used for accounts. Prisma writes rankings to the Supabase Postgres database from the Next.js server.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is used to create password accounts without sending confirmation emails. Do not prefix it with `NEXT_PUBLIC_`.

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Then fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.your-project-ref:your-database-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

Get `DATABASE_URL` from Supabase by clicking **Connect** in your project dashboard. Use the **Session pooler** connection string if the direct `db.<project-ref>.supabase.co:5432` connection is unreachable, then replace `[YOUR-PASSWORD]` with your database password.

Any signed-in user can create a game code on `/admin`. The creator becomes the admin for that game and can close the game when scoring is over.

The admin country selector uses REST Countries for country names/codes. Flags are loaded from FlagCDN by ISO alpha-2 country code.

Create/update the database table with Prisma:

```bash
npm run prisma:push
```

## Docker hosting

Build and run with Docker Compose:

```bash
docker compose up --build -d
```

The app will be available at `http://localhost:3000`.

To run the image directly:

```bash
docker build -t eurovision-ranking .
docker run -d \
  --name eurovision-ranking \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  eurovision-ranking
```

## Local checks

```bash
npm run lint
npm run build
```
