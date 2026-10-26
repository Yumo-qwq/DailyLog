begin;

-- Migration 008 replaced this trigger without the username required by migration 003.
-- Keep the monthly-subject behavior: new users start with no default subjects.
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
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    true
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;

  return new;
end;
$$;

commit;
