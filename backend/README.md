# SharkBid — Backend (Vercel + Supabase)

Serverless API for SharkBid. Deploys to **Vercel**, database is **Supabase** (PostgreSQL).

> Note: the spec mentioned MySQL, but Supabase was chosen as "better" — it's PostgreSQL.
> The SQL schema is plain Postgres; if you really need MySQL, the tables map 1:1.

## Stack

- **Host:** Vercel serverless functions (`/api/*`)
- **DB:** Supabase (PostgreSQL)
- **Client:** `@supabase/supabase-js` (service-role key, server-side only)

## Endpoints

| Method | Path                | Description                                      |
|--------|---------------------|--------------------------------------------------|
| GET    | `/api/health`       | Health check                                     |
| GET    | `/api/bids`         | Current hour leaderboard + time left             |
| POST   | `/api/bids`         | Add an hourly bid `{ url, amount }`              |
| GET    | `/api/throne`       | Permanent throne king + overtake amount          |
| POST   | `/api/throne`       | Add a throne bid `{ url, amount, description }`  |
| GET    | `/api/past-kings`   | Latest hourly leaders archive                    |

All bid amounts accumulate per URL/@handle. Hour rollover (archive leader +
clear the hour) runs automatically inside `rollover_hour` RPC on every request.

## Local dev

1. `npm install`
2. `cp .env.example .env.local` — fill in your Supabase credentials
3. `npx vercel dev` (or `npm run dev`)

## Deploy to Vercel

1. Create a Supabase project → open **SQL Editor** → run `db/schema.sql`
2. In Supabase **Settings → API**, copy the project URL and **service_role** key
3. `vercel` → link project → add env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. `vercel --prod`

The DB schema (`db/schema.sql`) creates:

- `hourly_bids` — one row per (hour_key, url_key), stackable amounts
- `throne_bids` — permanent paid spot, stackable amounts, description
- `past_kings` — hourly leader archive
- RPCs `add_hourly_bid`, `add_throne_bid`, `rollover_hour` (atomic, server-side)

## Frontend integration

Point the frontend at the deployed API, e.g.:

```js
const API = "https://YOUR-APP.vercel.app/api";

async function getBoard() {
  const r = await fetch(API + "/bids");
  return r.json();
}

async function placeBid(url, amount, { throne = false } = {}) {
  const r = await fetch(API + (throne ? "/throne" : "/bids"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, amount })
  });
  return r.json();
}
```

Replace the localStorage state in the frontend with these calls (timer/hour
logic can stay client-side for the countdown).
