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
