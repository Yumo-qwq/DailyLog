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
