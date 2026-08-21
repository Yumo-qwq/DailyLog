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
