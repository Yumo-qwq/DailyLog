-- Read-only verification for DailyLog remote Supabase schema.
-- Run this in Supabase SQL Editor after 001_init.sql, 002_profile_avatars.sql,
-- and 003_username_auth.sql succeed.

select
  'tables' as section,
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'checkins',
    'learning_columns',
    'checkin_entries',
    'checkin_images',
    'checkin_change_logs'
  )
order by table_name;

select
  'columns' as section,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'checkins',
    'learning_columns',
    'checkin_entries',
    'checkin_images',
    'checkin_change_logs'
  )
order by table_name, ordinal_position;

select
  'constraints' as section,
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  case contype
    when 'p' then 'primary key'
    when 'u' then 'unique'
    when 'f' then 'foreign key'
    when 'c' then 'check'
    else contype::text
  end as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid::regclass::text in (
    'profiles',
    'checkins',
    'learning_columns',
    'checkin_entries',
    'checkin_images',
    'checkin_change_logs'
  )
order by table_name, constraint_type, constraint_name;

select
  'rls_enabled' as section,
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'checkins',
    'learning_columns',
    'checkin_entries',
    'checkin_images',
    'checkin_change_logs'
  )
order by tablename;

select
  'policies' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public'
  and tablename in (
    'profiles',
    'checkins',
    'learning_columns',
    'checkin_entries',
    'checkin_images',
    'checkin_change_logs'
  ))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  'storage_bucket' as section,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('checkin-images', 'profile-avatars')
order by id;

select
  'rpc_functions' as section,
  routine_schema,
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'business_today',
    'is_active_member',
    'is_admin',
    'member_profiles',
    'normalize_username'
  )
order by routine_name;
