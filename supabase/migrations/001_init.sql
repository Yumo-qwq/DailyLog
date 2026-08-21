begin;

create extension if not exists pgcrypto;

create or replace function public.business_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Shanghai', now()))::date;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  );
$$;

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  content text not null default '',
  study_minutes integer not null default 0 check (study_minutes >= 0 and study_minutes <= 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.learning_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  column_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.checkin_entries (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  column_id uuid not null references public.learning_columns(id) on delete restrict,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkin_id, column_id)
);

create table if not exists public.checkin_images (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  column_id uuid not null references public.learning_columns(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null default '',
  content_type text not null default 'image/webp',
  size_bytes integer not null default 0 check (size_bytes >= 0 and size_bytes <= 1048576),
  created_at timestamptz not null default now()
);

create table if not exists public.checkin_change_logs (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  column_id uuid references public.learning_columns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default public.business_today(),
  user_name text not null default '',
  column_name text not null default '',
  action text not null,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_checkins_updated_at on public.checkins;
create trigger trg_checkins_updated_at
before update on public.checkins
for each row
execute function public.set_updated_at();

drop trigger if exists trg_checkin_entries_updated_at on public.checkin_entries;
create trigger trg_checkin_entries_updated_at
before update on public.checkin_entries
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'member'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    true
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;

  insert into public.learning_columns (user_id, name, column_order)
  values
    (new.id, '英语', 1),
    (new.id, '组成原理', 2),
    (new.id, '线性代数', 3)
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'profile privilege changes require admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_privilege_guard on public.profiles;
create trigger trg_profiles_privilege_guard
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.checkin_images enable row level security;
alter table public.learning_columns enable row level security;
alter table public.checkin_entries enable row level security;
alter table public.checkin_change_logs enable row level security;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read"
on public.profiles
for select
using (public.is_active_member() and is_active);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
using (auth.uid() = id and is_active)
with check (auth.uid() = id and is_active);

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
on public.profiles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "checkins_read" on public.checkins;
create policy "checkins_read"
on public.checkins
for select
using (public.is_active_member());

drop policy if exists "checkins_insert_own_today" on public.checkins;
create policy "checkins_insert_own_today"
on public.checkins
for insert
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and date = public.business_today()
);

drop policy if exists "checkins_update_own_today" on public.checkins;
create policy "checkins_update_own_today"
on public.checkins
for update
using (
  public.is_active_member()
  and user_id = auth.uid()
  and date = public.business_today()
)
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and date = public.business_today()
);

drop policy if exists "checkins_delete_none" on public.checkins;
create policy "checkins_delete_none"
on public.checkins
for delete
using (false);

drop policy if exists "learning_columns_read" on public.learning_columns;
create policy "learning_columns_read"
on public.learning_columns
for select
using (public.is_active_member());

drop policy if exists "learning_columns_insert_own" on public.learning_columns;
create policy "learning_columns_insert_own"
on public.learning_columns
for insert
with check (
  public.is_active_member()
  and user_id = auth.uid()
);

drop policy if exists "learning_columns_update_own" on public.learning_columns;
create policy "learning_columns_update_own"
on public.learning_columns
for update
using (
  public.is_active_member()
  and user_id = auth.uid()
)
with check (
  public.is_active_member()
  and user_id = auth.uid()
);

drop policy if exists "learning_columns_delete_none" on public.learning_columns;
create policy "learning_columns_delete_none"
on public.learning_columns
for delete
using (false);

drop policy if exists "checkin_entries_read" on public.checkin_entries;
create policy "checkin_entries_read"
on public.checkin_entries
for select
using (public.is_active_member());

drop policy if exists "checkin_entries_insert_today_only" on public.checkin_entries;
create policy "checkin_entries_insert_today_only"
on public.checkin_entries
for insert
with check (
  public.is_active_member()
  and exists (
    select 1
    from public.checkins c
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
  and exists (
    select 1
    from public.learning_columns lc
    where lc.id = column_id
      and lc.user_id = auth.uid()
  )
);

drop policy if exists "checkin_entries_update_today_only" on public.checkin_entries;
create policy "checkin_entries_update_today_only"
on public.checkin_entries
for update
using (
  public.is_active_member()
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
)
with check (
  public.is_active_member()
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

drop policy if exists "checkin_entries_delete_today_only" on public.checkin_entries;
drop policy if exists "checkin_entries_delete_none" on public.checkin_entries;
create policy "checkin_entries_delete_none"
on public.checkin_entries
for delete
using (false);

drop policy if exists "checkin_change_logs_read" on public.checkin_change_logs;
create policy "checkin_change_logs_read"
on public.checkin_change_logs
for select
using (public.is_active_member());

drop policy if exists "checkin_change_logs_insert_today_only" on public.checkin_change_logs;
create policy "checkin_change_logs_insert_today_only"
on public.checkin_change_logs
for insert
with check (
  public.is_active_member()
  and user_id = auth.uid()
  and date = public.business_today()
  and exists (
    select 1
    from public.checkins c
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
  and (
    column_id is null
    or exists (
      select 1
      from public.learning_columns lc
      where lc.id = column_id
        and lc.user_id = auth.uid()
    )
  )
);

drop policy if exists "checkin_change_logs_delete_none" on public.checkin_change_logs;
create policy "checkin_change_logs_delete_none"
on public.checkin_change_logs
for delete
using (false);

drop policy if exists "images_read" on public.checkin_images;
create policy "images_read"
on public.checkin_images
for select
using (public.is_active_member());

drop policy if exists "images_insert_today_only" on public.checkin_images;
create policy "images_insert_today_only"
on public.checkin_images
for insert
with check (
  public.is_active_member()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and split_part(storage_path, '/', 2) = checkin_id::text
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

drop policy if exists "images_update_today_only" on public.checkin_images;
create policy "images_update_today_only"
on public.checkin_images
for update
using (
  public.is_active_member()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and split_part(storage_path, '/', 2) = checkin_id::text
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
)
with check (
  public.is_active_member()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and split_part(storage_path, '/', 2) = checkin_id::text
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

drop policy if exists "images_delete_today_only" on public.checkin_images;
create policy "images_delete_today_only"
on public.checkin_images
for delete
using (
  public.is_active_member()
  and split_part(storage_path, '/', 1) = auth.uid()::text
  and split_part(storage_path, '/', 2) = checkin_id::text
  and exists (
    select 1
    from public.checkins c
    join public.learning_columns lc on lc.id = column_id
    where c.id = checkin_id
      and c.user_id = auth.uid()
      and lc.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-images', 'checkin-images', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "storage_read" on storage.objects;
create policy "storage_read"
on storage.objects
for select
using (bucket_id = 'checkin-images' and public.is_active_member());

drop policy if exists "storage_insert_today" on storage.objects;
create policy "storage_insert_today"
on storage.objects
for insert
with check (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1
    from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

drop policy if exists "storage_update_today" on storage.objects;
create policy "storage_update_today"
on storage.objects
for update
using (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1
    from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
)
with check (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1
    from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

drop policy if exists "storage_delete_today" on storage.objects;
create policy "storage_delete_today"
on storage.objects
for delete
using (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1
    from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and c.date = public.business_today()
  )
);

commit;
