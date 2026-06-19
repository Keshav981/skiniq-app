-- SkinIQ Supabase Database Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    name text not null,
    age_range text not null, -- '18-24', '25-34', '35-44', '45+'
    skin_type text,         -- 'oily', 'dry', 'combination', 'sensitive'
    skin_goals text[],      -- array: ['acne', 'anti-aging', 'brightening', 'hydration', 'general_health']
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SCANS TABLE
create table public.scans (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    image_url text, -- optional if raw photo is discarded
    image_retained boolean default false not null,
    scores jsonb not null, -- { hydration: 72, texture: 80, pores: 55, ... }
    explanations jsonb not null, -- { hydration: "...", texture: "...", ... }
    general_summary text not null,
    detections jsonb default '[]'::jsonb,
    recommended_products jsonb default '[]'::jsonb,
    is_front_facing boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- PRODUCTS TABLE
create table public.products (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    brand text not null,
    category text not null, -- 'moisturizer', 'serum', 'sunscreen', 'cleanser'
    price_inr integer not null,
    affiliate_link text not null,
    reason_text text not null,
    dimensions text[] not null, -- dimensions it addresses: ['hydration', 'texture']
    image_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- CLICK TRACKING TABLE
create table public.clicks (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade,
    scan_id uuid references public.scans(id) on delete set null,
    product_id uuid references public.products(id) on delete cascade not null,
    clicked_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- SUBSCRIPTIONS TABLE
create table public.subscriptions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade unique not null,
    status text not null, -- 'free', 'active', 'cancelled'
    tier text, -- 'monthly', 'annual'
    expires_at timestamp with time zone,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.scans enable row level security;
alter table public.products enable row level security;
alter table public.clicks enable row level security;
alter table public.subscriptions enable row level security;

-- Policies (Basic user access controls)
create policy "Users can view and update own profile" on public.profiles
    for all using (auth.uid() = id);

create policy "Users can view and delete own scans" on public.scans
    for all using (auth.uid() = user_id);

create policy "Anyone can view products" on public.products
    for select using (true);

create policy "Users can view/insert own clicks" on public.clicks
    for all using (auth.uid() = user_id);

create policy "Users can view own subscription" on public.subscriptions
    for select using (auth.uid() = user_id);
