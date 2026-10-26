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
