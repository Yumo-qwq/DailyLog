begin;

alter table public.learning_columns add column if not exists month_key text;
update public.learning_columns set month_key = to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM') where month_key is null;
alter table public.learning_columns alter column month_key set not null;
alter table public.learning_columns alter column month_key set default to_char(public.business_today(), 'YYYY-MM');
alter table public.learning_columns drop constraint if exists learning_columns_user_id_name_key;
create unique index if not exists learning_columns_user_month_name_key on public.learning_columns (user_id, month_key, name);

-- Existing columns may have been used across months. Copy their definitions for each
-- recorded month, then move each month's cells and images to the matching copy.
create temporary table monthly_column_map (old_id uuid, month_key text, new_id uuid, primary key (old_id, month_key)) on commit drop;
insert into monthly_column_map (old_id, month_key, new_id)
select source.old_id, source.month_key, gen_random_uuid()
from (
  select distinct lc.id as old_id, to_char(c.date, 'YYYY-MM') as month_key
  from public.learning_columns lc
  join (select checkin_id, column_id from public.checkin_entries union select checkin_id, column_id from public.checkin_images union select checkin_id, column_id from public.checkin_change_logs where column_id is not null) e on e.column_id = lc.id
  join public.checkins c on c.id = e.checkin_id
  where to_char(c.date, 'YYYY-MM') <> lc.month_key
) source;
insert into public.learning_columns (id, user_id, name, column_order, created_at, month_key)
select m.new_id, lc.user_id, lc.name, lc.column_order, lc.created_at, m.month_key
from monthly_column_map m join public.learning_columns lc on lc.id = m.old_id;
update public.checkin_entries e set column_id = m.new_id
from public.checkins c, monthly_column_map m
where e.checkin_id = c.id and e.column_id = m.old_id and to_char(c.date, 'YYYY-MM') = m.month_key;
update public.checkin_images i set column_id = m.new_id
from public.checkins c, monthly_column_map m
where i.checkin_id = c.id and i.column_id = m.old_id and to_char(c.date, 'YYYY-MM') = m.month_key;
update public.checkin_change_logs l set column_id = m.new_id
from monthly_column_map m
where l.column_id = m.old_id and to_char(l.date, 'YYYY-MM') = m.month_key;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'member'), new.raw_user_meta_data->>'avatar_url', coalesce(new.raw_user_meta_data->>'role', 'member'), true)
  on conflict (id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop policy if exists "learning_columns_insert_own" on public.learning_columns;
create policy "learning_columns_insert_own" on public.learning_columns for insert
with check (public.is_active_member() and user_id = auth.uid() and month_key = to_char(public.business_today(), 'YYYY-MM'));
drop policy if exists "learning_columns_update_own" on public.learning_columns;
create policy "learning_columns_update_own" on public.learning_columns for update
using (public.is_active_member() and user_id = auth.uid() and month_key = to_char(public.business_today(), 'YYYY-MM'))
with check (public.is_active_member() and user_id = auth.uid() and month_key = to_char(public.business_today(), 'YYYY-MM'));

create or replace function public.guard_monthly_column()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.month_key <> old.month_key) then
    raise exception 'cannot move a subject to another month';
  end if;
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    if old.month_key <> to_char(public.business_today(), 'YYYY-MM') then
      raise exception 'archived subject is read only';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists trg_guard_monthly_column on public.learning_columns;
create trigger trg_guard_monthly_column before update or delete on public.learning_columns
for each row execute function public.guard_monthly_column();

-- A daily entry must belong to a subject for that same month.
create or replace function public.guard_entry_subject_month()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.checkins c
    join public.learning_columns lc on lc.id = new.column_id
    where c.id = new.checkin_id and c.user_id = lc.user_id
      and to_char(c.date, 'YYYY-MM') = lc.month_key
  ) then
    raise exception 'subject and daily record must belong to the same month';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_entry_subject_month on public.checkin_entries;
create trigger trg_entry_subject_month before insert or update on public.checkin_entries
for each row execute function public.guard_entry_subject_month();
drop trigger if exists trg_image_subject_month on public.checkin_images;
create trigger trg_image_subject_month before insert or update on public.checkin_images
for each row execute function public.guard_entry_subject_month();

-- The client removes detached storage objects after the subject deletion RPC.
-- Image metadata remains protected by its existing daily policies.
drop policy if exists "storage_delete_today" on storage.objects;
create policy "storage_delete_current_month" on storage.objects for delete
using (
  bucket_id = 'checkin-images'
  and public.is_active_member()
  and split_part(name, '/', 1) = auth.uid()::text
  and exists (
    select 1 from public.checkins c
    where c.id::text = split_part(name, '/', 2)
      and c.user_id = auth.uid()
      and (
        c.date = public.business_today()
        or (
          to_char(c.date, 'YYYY-MM') = to_char(public.business_today(), 'YYYY-MM')
          and not exists (select 1 from public.checkin_images i where i.storage_path = storage.objects.name)
        )
      )
  )
);

-- Only this function can remove all entries for a current-month subject.
create or replace function public.delete_current_month_subject(subject_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare paths text[];
declare affected_checkins uuid[];
begin
  if not public.is_active_member() or not exists (
    select 1 from public.learning_columns
    where id = subject_id and user_id = auth.uid()
      and month_key = to_char(public.business_today(), 'YYYY-MM')
  ) then
    raise exception 'subject is missing or archived';
  end if;
  select coalesce(array_agg(storage_path), '{}') into paths
  from public.checkin_images where column_id = subject_id;
  select coalesce(array_agg(distinct checkin_id), '{}') into affected_checkins
  from (
    select checkin_id from public.checkin_entries where column_id = subject_id
    union
    select checkin_id from public.checkin_images where column_id = subject_id
  ) affected;
  delete from public.checkin_images where column_id = subject_id;
  delete from public.checkin_entries where column_id = subject_id;
  delete from public.checkin_change_logs where column_id = subject_id;
  delete from public.learning_columns where id = subject_id;
  update public.checkins c set
    content = coalesce((
      select string_agg(lc.name || '：' || case
        when nullif(trim(e.content), '') is not null then left(trim(e.content), 14)
        else '图片' || (select count(*) from public.checkin_images i where i.checkin_id = c.id and i.column_id = lc.id)::text || '张'
      end, '；' order by lc.column_order)
      from public.checkin_entries e
      join public.learning_columns lc on lc.id = e.column_id
      where e.checkin_id = c.id and (
        nullif(trim(e.content), '') is not null
        or exists (select 1 from public.checkin_images i where i.checkin_id = c.id and i.column_id = e.column_id)
      )
    ), ''),
    study_minutes = (
      select count(*) from public.checkin_entries e
      where e.checkin_id = c.id and (
        nullif(trim(e.content), '') is not null
        or exists (select 1 from public.checkin_images i where i.checkin_id = c.id and i.column_id = e.column_id)
      )
    )
  where c.id = any(affected_checkins);
  return paths;
end;
$$;
revoke all on function public.delete_current_month_subject(uuid) from public;
grant execute on function public.delete_current_month_subject(uuid) to authenticated;

commit;
