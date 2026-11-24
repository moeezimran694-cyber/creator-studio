-- Creator Studio Reference PostgreSQL + Row Level Security (RLS) Schema
-- Use this schema if deploying to an external Supabase PostgreSQL instance.

create extension if not exists "pgcrypto";

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'USER' check (role in ('USER', 'ADMIN', 'SUPER_ADMIN')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  last_login timestamptz not null default now()
);

-- 2. Admin Permissions
create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  granted boolean not null default false,
  granted_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (admin_user_id, permission_key)
);

-- 3. Admin Invitations
create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invitation_token_hash text not null,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED')),
  created_at timestamptz not null default now()
);

-- 4. Apps
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon_url text,
  category text not null,
  version text not null,
  file_size text not null,
  description text not null,
  features jsonb not null default '[]'::jsonb,
  price_pkr integer not null check (price_pkr >= 0),
  download_storage_path text not null,
  is_featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete restrict,
  transaction_id text not null,
  payment_method text not null check (payment_method in ('EasyPaisa', 'JazzCash')),
  screenshot_path text,
  amount_pkr integer not null check (amount_pkr >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6. Payment Settings
create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  method text not null unique check (method in ('EasyPaisa', 'JazzCash')),
  account_title text not null,
  account_number text not null,
  instructions text not null,
  qr_image_path text,
  updated_at timestamptz not null default now()
);

-- 7. Website Settings
create table if not exists public.website_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- 8. Audit Logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.apps enable row level security;
alter table public.orders enable row level security;
alter table public.payment_settings enable row level security;
alter table public.website_settings enable row level security;
alter table public.audit_logs enable row level security;
