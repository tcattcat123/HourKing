-- ============================================================
-- HourKing — Supabase schema (PostgreSQL)
-- Run this in the Supabase SQL Editor once.
-- The backend calls these tables via the service-role key.
-- ============================================================

-- Optional: safe against uuid generation
create extension if not exists "pgcrypto";

-- Hourly spots: one row per (hour, url). Bids accumulate per hour.
create table if not exists public.hourly_bids (
  id         uuid primary key default gen_random_uuid(),
  hour_key   text not null,               -- e.g. '2026-08-29T10'
  url_key    text not null,               -- normalized 'example.com' or '@handle'
  amount     integer not null default 0,  -- total bid this hour
  title      text not null default '',
  favicon    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hour_key, url_key)
);

create index if not exists hourly_bids_hour_idx on public.hourly_bids (hour_key);
create index if not exists hourly_bids_rank_idx  on public.hourly_bids (hour_key, amount desc);

-- The permanent paid spot (middle block). Bids accumulate forever.
create table if not exists public.throne_bids (
  id          uuid primary key default gen_random_uuid(),
  url_key     text not null unique,
  amount      integer not null default 0,
  title       text not null default '',
  favicon     text not null default '',
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Archive of hourly leaders (past hours).
create table if not exists public.past_kings (
  id         uuid primary key default gen_random_uuid(),
  hour_key   text not null unique,
  url_key    text not null,
  amount     integer not null default 0,
  title      text not null default '',
  favicon    text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- RPC: atomically add a bid to an hourly spot (stackable).
-- ============================================================
create or replace function public.add_hourly_bid(
  p_hour_key text,
  p_url_key  text,
  p_amount   integer,
  p_title    text,
  p_favicon  text
) returns table (amount integer, title text, favicon text)
language plpgsql
as $$
begin
  insert into public.hourly_bids (hour_key, url_key, amount, title, favicon)
  values (p_hour_key, p_url_key, p_amount, p_title, p_favicon)
  on conflict (hour_key, url_key)
  do update set
    amount    = public.hourly_bids.amount + excluded.amount,
    title     = excluded.title,
    favicon   = excluded.favicon,
    updated_at = now()
  returning public.hourly_bids.amount, public.hourly_bids.title, public.hourly_bids.favicon
  into amount, title, favicon;

  return next;
end;
$$;

-- ============================================================
-- RPC: atomically add a bid to the permanent throne spot.
-- Description only updates when a non-empty value is provided.
-- ============================================================
create or replace function public.add_throne_bid(
  p_url_key text,
  p_amount  integer,
  p_title   text,
  p_favicon text,
  p_desc    text default ''
) returns table (amount integer, title text, favicon text, description text)
language plpgsql
as $$
begin
  insert into public.throne_bids (url_key, amount, title, favicon, description)
  values (p_url_key, p_amount, p_title, p_favicon, p_desc)
  on conflict (url_key)
  do update set
    amount      = public.throne_bids.amount + excluded.amount,
    title       = excluded.title,
    favicon     = excluded.favicon,
    description = case
                    when excluded.description <> '' then excluded.description
                    else public.throne_bids.description
                  end,
    updated_at  = now()
  returning public.throne_bids.amount, public.throne_bids.title, public.throne_bids.favicon, public.throne_bids.description
  into amount, title, favicon, description;

  return next;
end;
$$;

-- ============================================================
-- RPC: hour rollover.
-- Archives the leader of every hour older than the current one,
-- then clears those hourly rows. Called at the start of each request.
-- ============================================================
create or replace function public.rollover_hour(p_now_hour text)
returns void
language plpgsql
as $$
begin
  insert into public.past_kings (hour_key, url_key, amount, title, favicon)
  select h.hour_key, h.url_key, h.amount, h.title, h.favicon
  from (
    select distinct on (hour_key) hour_key, url_key, amount, title, favicon
    from public.hourly_bids
    where hour_key < p_now_hour
    order by hour_key desc, amount desc
  ) h
  on conflict (hour_key) do nothing;

  delete from public.hourly_bids where hour_key < p_now_hour;
end;
$$;

-- ============================================================
-- RLS: the service-role key bypasses RLS, so policies are optional.
-- If you want to lock tables down, enable RLS and add policies for
-- an authenticated (anon) role later. Not required for the MVP.
-- ============================================================
