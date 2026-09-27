-- Fold Library production schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.library_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  pages integer not null check (pages > 0),
  size_bytes bigint not null check (size_bytes > 0),
  description text not null default '',
  file_name text not null,
  storage_path text not null unique,
  status text not null default 'published' check (status in ('pending', 'published', 'rejected')),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_reason text
);

alter table public.library_documents add column if not exists status text not null default 'published';
alter table public.library_documents add column if not exists is_public boolean not null default true;
alter table public.library_documents add column if not exists reviewed_at timestamptz;
alter table public.library_documents add column if not exists reviewed_reason text;

update public.library_documents
set status = 'published', is_public = true
where status is null or status <> 'published' or is_public = false;

create index if not exists library_documents_created_at_idx
  on public.library_documents (created_at desc);

create index if not exists library_documents_category_idx
  on public.library_documents (category);

create index if not exists library_documents_status_created_at_idx
  on public.library_documents (status, created_at desc);

create table if not exists public.library_reports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.library_documents(id) on delete cascade,
  reason text not null check (reason in ('copyright', 'spam', 'malware', 'illegal', 'misleading', 'other')),
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists library_reports_document_id_idx
  on public.library_reports (document_id, created_at desc);

alter table public.library_documents enable row level security;
alter table public.library_reports enable row level security;

insert into storage.buckets (id, name, public)
values ('library', 'library', true)
on conflict (id) do update set public = true;

-- The app uses the server-side service-role key for database/storage operations.
-- Keep SUPABASE_SERVICE_ROLE_KEY server-only.
