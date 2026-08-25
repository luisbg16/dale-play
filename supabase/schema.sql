-- Ejecuta este archivo en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  language text not null default 'es' check (language in ('es','en')),
  genre text,
  difficulty text not null default 'media' check (difficulty in ('facil','media','dificil','experto','imposible')),
  year integer,
  audio_url text not null,
  storage_path text,
  clip_start numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.songs enable row level security;

drop policy if exists "Public can read active songs" on public.songs;
create policy "Public can read active songs"
on public.songs for select
to anon, authenticated
using (active = true or auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert songs" on public.songs;
create policy "Authenticated can insert songs"
on public.songs for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update songs" on public.songs;
create policy "Authenticated can update songs"
on public.songs for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete songs" on public.songs;
create policy "Authenticated can delete songs"
on public.songs for delete
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('song-clips','song-clips',true)
on conflict (id) do update set public = true;

drop policy if exists "Public can listen to song clips" on storage.objects;
create policy "Public can listen to song clips"
on storage.objects for select
to public
using (bucket_id = 'song-clips');

drop policy if exists "Authenticated can upload song clips" on storage.objects;
create policy "Authenticated can upload song clips"
on storage.objects for insert
to authenticated
with check (bucket_id = 'song-clips');

drop policy if exists "Authenticated can delete song clips" on storage.objects;
create policy "Authenticated can delete song clips"
on storage.objects for delete
to authenticated
using (bucket_id = 'song-clips');
