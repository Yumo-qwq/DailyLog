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
