-- DailyLog complete database setup (fresh Supabase project only).
-- Generated from supabase/migrations/001 through 007, in order.
-- For an existing project, run ONLY migrations that have not already been applied.
-- In the current upgrade, that is normally 007_admin_observer_role.sql.
-- This file does not deploy the admin-invite-user Edge Function, configure Auth URLs,
-- create an initial Auth user, or publish the web/Android app.

-- ===== 001_init.sql =====
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

-- ===== 002_profile_avatars.sql =====
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 524288,
      allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "profile_avatars_read" on storage.objects;
create policy "profile_avatars_read"
on storage.objects
for select
using (
  bucket_id = 'profile-avatars'
  and public.is_active_member()
);

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'profile-avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own"
on storage.objects
for update
using (
  bucket_id = 'profile-avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'profile-avatars'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
);

commit;

-- ===== 003_username_auth.sql =====
begin;

create or replace function public.normalize_username(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '_' from regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9_]+', '_', 'g')),
    ''
  );
$$;

alter table public.profiles
  add column if not exists username text;

do $$
declare
  item record;
  base_username text;
  candidate text;
  suffix integer;
begin
  for item in
    select
      p.id,
      coalesce(
        public.normalize_username(u.raw_user_meta_data->>'username'),
        public.normalize_username(split_part(coalesce(u.email, ''), '@', 1)),
        public.normalize_username(p.display_name),
        'user_' || replace(left(p.id::text, 8), '-', '')
      ) as raw_username
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.username is null or p.username = ''
    order by p.created_at, p.id
  loop
    base_username := coalesce(item.raw_username, 'user_' || replace(left(item.id::text, 8), '-', ''));
    if length(base_username) < 3 then
      base_username := rpad(base_username, 3, '0');
    end if;
    base_username := left(base_username, 32);

    candidate := base_username;
    suffix := 2;
    while exists (
      select 1
      from public.profiles p
      where p.username = candidate
        and p.id <> item.id
    ) loop
      candidate := left(base_username, greatest(1, 32 - length('_' || suffix::text))) || '_' || suffix::text;
      suffix := suffix + 1;
    end loop;

    update public.profiles
    set username = candidate
    where id = item.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format
  check (
    username ~ '^[a-z0-9_]{3,32}$'
    and public.normalize_username(username) is not null
    and username = public.normalize_username(username)
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_key unique (username);
  end if;
end;
$$;

create or replace function public.member_profiles()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.role, p.is_active, p.created_at
  from public.profiles p
  where p.is_active
    and public.is_active_member()
  order by p.created_at;
$$;

revoke all on function public.member_profiles() from public;
grant execute on function public.member_profiles() to authenticated;

drop policy if exists "profiles_read" on public.profiles;
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read"
on public.profiles
for select
using (auth.uid() = id and is_active);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_username text;
begin
  next_username := coalesce(
    public.normalize_username(new.raw_user_meta_data->>'username'),
    public.normalize_username(split_part(coalesce(new.email, ''), '@', 1)),
    'user_' || replace(left(new.id::text, 8), '-', '')
  );

  if length(next_username) < 3 then
    next_username := rpad(next_username, 3, '0');
  end if;
  next_username := left(next_username, 32);

  insert into public.profiles (id, username, display_name, avatar_url, role, is_active)
  values (
    new.id,
    next_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), next_username),
    new.raw_user_meta_data->>'avatar_url',
    'member',
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

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username is immutable';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not public.is_admin()
    and (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
  then
    raise exception 'profile privilege changes require admin';
  end if;
  return new;
end;
$$;

commit;

-- ===== 004_daily_checkin.sql =====
begin;

alter table public.checkins
  add column if not exists checked_in_at timestamptz;

-- Preserve meaningful historical study records without counting empty rows that
-- were created only to attach column/profile logs.
update public.checkins
set checked_in_at = coalesce(updated_at, created_at, now())
where checked_in_at is null
  and (
    nullif(trim(content), '') is not null
    or study_minutes > 0
    or exists (
      select 1
      from public.checkin_entries e
      where e.checkin_id = checkins.id
        and nullif(trim(e.content), '') is not null
    )
    or exists (
      select 1
      from public.checkin_images i
      where i.checkin_id = checkins.id
    )
    or exists (
      select 1
      from public.checkin_change_logs l
      where l.checkin_id = checkins.id
        and l.action in ('cell-create', 'cell-update', 'cell-clear', 'cell-images')
    )
  );

create or replace function public.mark_today_checkin()
returns public.checkins
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.checkins;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'active authentication required';
  end if;

  insert into public.checkins (
    user_id,
    date,
    content,
    study_minutes,
    checked_in_at
  )
  values (
    auth.uid(),
    public.business_today(),
    '',
    0,
    now()
  )
  on conflict (user_id, date) do update
    set checked_in_at = coalesce(public.checkins.checked_in_at, excluded.checked_in_at),
        updated_at = case
          when public.checkins.checked_in_at is null then now()
          else public.checkins.updated_at
        end
  where public.checkins.user_id = auth.uid()
    and public.checkins.date = public.business_today()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.mark_today_checkin() from public;
grant execute on function public.mark_today_checkin() to authenticated;

commit;

-- ===== 005_admin_table_visibility.sql =====
begin;

-- Keep the admin account in the same learning-table model as every member.
-- This repairs accounts created before the profile/column trigger was installed.
insert into public.learning_columns (user_id, name, column_order)
select p.id, defaults.name, defaults.column_order
from public.profiles p
cross join (
  values
    ('英语'::text, 1),
    ('组成原理'::text, 2),
    ('线性代数'::text, 3)
) as defaults(name, column_order)
where not exists (
  select 1
  from public.learning_columns lc
  where lc.user_id = p.id
    and lc.name = defaults.name
);

create or replace function public.member_profiles()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.role, p.is_active, p.created_at
  from public.profiles p
  where p.is_active
    and public.is_active_member()
  order by p.created_at;
$$;

revoke all on function public.member_profiles() from public;
grant execute on function public.member_profiles() to authenticated;

commit;

-- ===== 006_guarantee_admin_member_visibility.sql =====
begin;

-- Repair old accounts created before learning-column seeding was installed.
insert into public.learning_columns (user_id, name, column_order)
select p.id, defaults.name, defaults.column_order
from public.profiles p
cross join (
  values
    ('英语'::text, 1),
    ('组成原理'::text, 2),
    ('线性代数'::text, 3)
) as defaults(name, column_order)
where not exists (
  select 1
  from public.learning_columns lc
  where lc.user_id = p.id
    and lc.name = defaults.name
);

-- Return every active profile, including admins, without exposing auth.users data.
create or replace function public.member_profiles()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.role, p.is_active, p.created_at
  from public.profiles p
  where p.is_active
    and exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.is_active
    )
  order by p.created_at, p.id;
$$;

revoke all on function public.member_profiles() from public;
grant execute on function public.member_profiles() to authenticated;

commit;

-- ===== 007_admin_observer_role.sql =====
begin;

-- Administrators manage accounts and observe learning records; only learners own them.
create or replace function public.is_learning_member(subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = subject_id
      and p.role = 'member'
      and p.is_active
  );
$$;

revoke all on function public.is_learning_member(uuid) from public;
grant execute on function public.is_learning_member(uuid) to authenticated;

-- The member directory does not expose administrator accounts.
create or replace function public.member_profiles()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.role, p.is_active, p.created_at
  from public.profiles p
  where p.role = 'member'
    and p.is_active
    and public.is_active_member()
  order by p.created_at, p.id;
$$;

revoke all on function public.member_profiles() from public;
grant execute on function public.member_profiles() to authenticated;

-- Existing administrator rows are retained but cannot be read as learning data.
drop policy if exists "checkins_read" on public.checkins;
create policy "checkins_read" on public.checkins for select
using (public.is_active_member() and public.is_learning_member(user_id));

drop policy if exists "learning_columns_read" on public.learning_columns;
create policy "learning_columns_read" on public.learning_columns for select
using (public.is_active_member() and public.is_learning_member(user_id));

drop policy if exists "checkin_entries_read" on public.checkin_entries;
create policy "checkin_entries_read" on public.checkin_entries for select
using (public.is_active_member() and exists (
  select 1 from public.checkins c where c.id = checkin_id
));

drop policy if exists "images_read" on public.checkin_images;
create policy "images_read" on public.checkin_images for select
using (public.is_active_member() and exists (
  select 1 from public.checkins c where c.id = checkin_id
));

drop policy if exists "checkin_change_logs_read" on public.checkin_change_logs;
create policy "checkin_change_logs_read" on public.checkin_change_logs for select
using (public.is_active_member() and public.is_learning_member(user_id));

drop policy if exists "storage_read" on storage.objects;
create policy "storage_read" on storage.objects for select
using (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and exists (
    select 1 from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id::text = split_part(name, '/', 1)
  )
);

-- Restrictive policies add a learner-role requirement to the existing today/owner rules.
drop policy if exists "checkins_learner_insert" on public.checkins;
create policy "checkins_learner_insert" on public.checkins as restrictive
for insert to authenticated with check (public.is_learning_member(auth.uid()));
drop policy if exists "checkins_learner_update" on public.checkins;
create policy "checkins_learner_update" on public.checkins as restrictive
for update to authenticated using (public.is_learning_member(auth.uid()))
with check (public.is_learning_member(auth.uid()));

drop policy if exists "columns_learner_insert" on public.learning_columns;
create policy "columns_learner_insert" on public.learning_columns as restrictive
for insert to authenticated with check (public.is_learning_member(auth.uid()));
drop policy if exists "columns_learner_update" on public.learning_columns;
create policy "columns_learner_update" on public.learning_columns as restrictive
for update to authenticated using (public.is_learning_member(auth.uid()))
with check (public.is_learning_member(auth.uid()));

drop policy if exists "entries_learner_insert" on public.checkin_entries;
create policy "entries_learner_insert" on public.checkin_entries as restrictive
for insert to authenticated with check (public.is_learning_member(auth.uid()));
drop policy if exists "entries_learner_update" on public.checkin_entries;
create policy "entries_learner_update" on public.checkin_entries as restrictive
for update to authenticated using (public.is_learning_member(auth.uid()))
with check (public.is_learning_member(auth.uid()));

drop policy if exists "images_learner_insert" on public.checkin_images;
create policy "images_learner_insert" on public.checkin_images as restrictive
for insert to authenticated with check (public.is_learning_member(auth.uid()));
drop policy if exists "images_learner_update" on public.checkin_images;
create policy "images_learner_update" on public.checkin_images as restrictive
for update to authenticated using (public.is_learning_member(auth.uid()))
with check (public.is_learning_member(auth.uid()));
drop policy if exists "images_learner_delete" on public.checkin_images;
create policy "images_learner_delete" on public.checkin_images as restrictive
for delete to authenticated using (public.is_learning_member(auth.uid()));

drop policy if exists "logs_learner_insert" on public.checkin_change_logs;
create policy "logs_learner_insert" on public.checkin_change_logs as restrictive
for insert to authenticated with check (public.is_learning_member(auth.uid()));

drop policy if exists "storage_learner_insert" on storage.objects;
create policy "storage_learner_insert" on storage.objects as restrictive
for insert to authenticated with check (
  bucket_id <> 'checkin-images' or public.is_learning_member(auth.uid())
);
drop policy if exists "storage_learner_update" on storage.objects;
create policy "storage_learner_update" on storage.objects as restrictive
for update to authenticated using (
  bucket_id <> 'checkin-images' or public.is_learning_member(auth.uid())
) with check (
  bucket_id <> 'checkin-images' or public.is_learning_member(auth.uid())
);
drop policy if exists "storage_learner_delete" on storage.objects;
create policy "storage_learner_delete" on storage.objects as restrictive
for delete to authenticated using (
  bucket_id <> 'checkin-images' or public.is_learning_member(auth.uid())
);

commit;

