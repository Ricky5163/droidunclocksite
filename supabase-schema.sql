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
  publish_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products
add column if not exists publish_at timestamptz;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  country text not null,
  address text not null,
  postal_code text not null,
  city text not null,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  payment_currency text not null default 'EUR',
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
  stripe_session_id text,
  stripe_payment_intent_id text,
  encrypted_notes jsonb,
  stock_reserved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.orders
add column if not exists stock_reserved_at timestamptz;

alter table public.orders
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.orders
add column if not exists payment_currency text not null default 'EUR';

alter table public.orders
add column if not exists encrypted_notes jsonb;

alter table public.orders
add column if not exists expires_at timestamptz;

alter table public.orders
add column if not exists stripe_session_id text;

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
  user_id uuid references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.admin_users
add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists admin_users_user_id_key
on public.admin_users(user_id)
where user_id is not null;

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
    where admin_users.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists "Public can read active products" on public.products;
drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
on public.products for select
to anon, authenticated
using (
  active = true
  and (publish_at is null or publish_at <= now())
);

drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products"
on public.products for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
on public.products for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
on public.products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
on public.products for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins manage products" on public.products;

drop policy if exists "Admins read admin users" on public.admin_users;
drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users for select
to authenticated
using (public.is_admin());

drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers can view own orders"
on public.orders for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins view orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders"
on public.orders for select
to authenticated
using (public.is_admin());

drop policy if exists "Customers can create own orders" on public.orders;
create policy "Customers can create own orders"
on public.orders for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Admins update orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
on public.orders for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Customers view own orders" on public.orders;

drop policy if exists "Customers can view own order items" on public.order_items;
create policy "Customers can view own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

drop policy if exists "Admins view order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;
create policy "Admins can view all order items"
on public.order_items for select
to authenticated
using (public.is_admin());

drop policy if exists "Customers view own order items" on public.order_items;

create or replace function public.reserve_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item_row record;
  updated_count integer;
begin
  select *
  into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if order_row.stock_reserved_at is not null then
    return;
  end if;

  if order_row.payment_status <> 'paid' then
    raise exception 'Order is not paid.';
  end if;

  for item_row in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
  loop
    update public.products
    set
      stock = stock - item_row.quantity,
      active = (stock - item_row.quantity) > 0
    where id = item_row.product_id
      and active = true
      and stock >= item_row.quantity;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'Insufficient stock for product %.', item_row.product_id;
    end if;
  end loop;

  update public.orders
  set stock_reserved_at = now()
  where id = p_order_id;
end;
$$;

revoke execute on function public.reserve_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid) to service_role;

create or replace function public.mark_order_paid_after_stock(
  p_order_id uuid,
  p_stripe_payment_intent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item_row record;
  updated_count integer;
begin
  select *
  into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if order_row.payment_status = 'paid' and order_row.stock_reserved_at is not null then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'payment_status', order_row.payment_status,
      'order_status', order_row.order_status
    );
  end if;

  for item_row in
    select
      order_items.product_id,
      order_items.quantity,
      products.name as product_name,
      products.stock,
      products.active
    from public.order_items
    join public.products on products.id = order_items.product_id
    where order_items.order_id = p_order_id
      and order_items.product_id is not null
    for update of products
  loop
    if item_row.active is not true or item_row.stock < item_row.quantity then
      update public.orders
      set
        payment_status = 'payment_confirmed_stock_failed',
        stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id)
      where id = p_order_id;

      return jsonb_build_object(
        'ok', false,
        'changed', false,
        'payment_status', 'payment_confirmed_stock_failed',
        'order_status', order_row.order_status,
        'error', 'Insufficient stock for product ' || coalesce(item_row.product_name, item_row.product_id::text) || '.'
      );
    end if;
  end loop;

  for item_row in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
      and product_id is not null
  loop
    update public.products
    set
      stock = stock - item_row.quantity,
      active = (stock - item_row.quantity) > 0
    where id = item_row.product_id
      and active = true
      and stock >= item_row.quantity;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      update public.orders
      set
        payment_status = 'payment_confirmed_stock_failed',
        stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id)
      where id = p_order_id;

      return jsonb_build_object(
        'ok', false,
        'changed', false,
        'payment_status', 'payment_confirmed_stock_failed',
        'order_status', order_row.order_status,
        'error', 'Insufficient stock for product ' || item_row.product_id || '.'
      );
    end if;
  end loop;

  update public.orders
  set
    payment_status = 'paid',
    order_status = 'Paid',
    stock_reserved_at = coalesce(stock_reserved_at, now()),
    stripe_payment_intent_id = coalesce(p_stripe_payment_intent_id, stripe_payment_intent_id)
  where id = p_order_id
  returning * into order_row;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'payment_status', order_row.payment_status,
    'order_status', order_row.order_status
  );
end;
$$;

revoke execute on function public.mark_order_paid_after_stock(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_order_paid_after_stock(uuid, text) to service_role;

create index if not exists products_slug_idx on public.products(slug);
create index if not exists products_category_idx on public.products(category);
create index if not exists products_publish_at_idx on public.products(publish_at);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_stripe_session_id_idx on public.orders(stripe_session_id);

-- Create this email in Supabase Auth first, then this row authorizes it for admin.html.
insert into public.admin_users (user_id, email, role)
select id, email, 'owner'
from auth.users
where email = 'admin@droidunclock.site'
on conflict (email) do update
set
  user_id = excluded.user_id,
  role = excluded.role;
