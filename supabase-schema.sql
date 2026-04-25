-- Droidunclock Supabase schema
-- Run in Supabase SQL Editor. Add your own first admin email at the bottom.

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  brand text,
  model text,
  category text not null check (category in (
    'Refurbished Phones',
    'Phone Screens',
    'Batteries',
    'Charging Ports',
    'Accessories',
    'Repair Services'
  )),
  description text,
  price numeric(10,2) not null check (price >= 0),
  discount_price numeric(10,2) check (discount_price is null or discount_price >= 0),
  condition text check (condition in ('New','Used','Refurbished','Excellent','Good')),
  stock integer not null default 0 check (stock >= 0),
  images jsonb not null default '[]'::jsonb,
  image_url text,
  technical_details text,
  warranty_info text,
  delivery_info text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  country text not null,
  address text not null,
  postal_code text not null,
  city text not null,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  payment_method text not null check (payment_method in ('stripe','paypal')),
  payment_status text not null default 'pending',
  order_status text not null default 'Pending' check (order_status in (
    'Pending',
    'Paid',
    'Processing',
    'Shipped',
    'Completed',
    'Cancelled'
  )),
  paypal_order_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total_price numeric(10,2) not null check (total_price >= 0)
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = auth.jwt() ->> 'email'
  );
$$;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select
using (active = true or public.is_admin());

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read admin users" on public.admin_users;
create policy "Admins read admin users"
on public.admin_users for select
using (public.is_admin());

drop policy if exists "Admins view orders" on public.orders;
create policy "Admins view orders"
on public.orders for select
using (public.is_admin());

drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders"
on public.orders for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins view order items" on public.order_items;
create policy "Admins view order items"
on public.order_items for select
using (public.is_admin());

create index if not exists products_slug_idx on public.products(slug);
create index if not exists products_category_idx on public.products(category);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- Create this email in Supabase Auth, then this row authorizes it for admin.html.
insert into public.admin_users (email, role)
values ('admin@droidunclock.site', 'owner')
on conflict (email) do update set role = excluded.role;
