-- Initial schema for community app
-- Includes tables, indexes, RLS, triggers, and invite redemption RPC.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(display_name)) between 2 and 40)
);

create table if not exists public.invite_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  invited_name text not null,
  invited_email text,
  note text,
  expires_at timestamptz,
  is_redeemed boolean not null default false,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code = upper(code)),
  check (code ~ '^[A-Z0-9_-]{6,32}$'),
  check (invited_email is null or invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  check (expires_at is null or expires_at > created_at),
  check (
    (is_redeemed = false and redeemed_by is null and redeemed_at is null)
    or
    (is_redeemed = true and redeemed_by is not null and redeemed_at is not null)
  )
);

create table if not exists public.meetups (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 2 and 120),
  check (capacity is null or capacity > 0),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.meetup_participants (
  meetup_id bigint not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'joined',
  note text not null default '',
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id),
  check (status in ('joined', 'waitlist', 'cancelled'))
);

create table if not exists public.grace_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 2 and 150),
  check (char_length(btrim(content)) > 0)
);

create table if not exists public.grace_post_likes (
  post_id bigint not null references public.grace_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.prayer_requests (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  is_anonymous boolean not null default false,
  is_answered boolean not null default false,
  answered_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 2 and 150),
  check (char_length(btrim(content)) > 0),
  check (is_answered = false or nullif(btrim(coalesce(answered_note, '')), '') is not null)
);

create table if not exists public.prayer_supports (
  request_id bigint not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table if not exists public.praise_recommendations (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  artist text not null default '',
  youtube_url text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(title)) between 2 and 150),
  check (youtube_url is null or youtube_url ~* '^https?://')
);

create table if not exists public.praise_likes (
  recommendation_id bigint not null references public.praise_recommendations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recommendation_id, user_id)
);

create index if not exists idx_invite_codes_created_by on public.invite_codes (created_by);
create index if not exists idx_invite_codes_redeemed_by on public.invite_codes (redeemed_by);
create index if not exists idx_invite_codes_expires_at on public.invite_codes (expires_at);

create index if not exists idx_meetups_created_by on public.meetups (created_by);
create index if not exists idx_meetups_starts_at on public.meetups (starts_at);

create index if not exists idx_meetup_participants_user_id on public.meetup_participants (user_id);
create index if not exists idx_meetup_participants_status on public.meetup_participants (status);

create index if not exists idx_grace_posts_author_id on public.grace_posts (author_id);
create index if not exists idx_grace_posts_created_at on public.grace_posts (created_at desc);
create index if not exists idx_grace_post_likes_user_id on public.grace_post_likes (user_id);

create index if not exists idx_prayer_requests_author_id on public.prayer_requests (author_id);
create index if not exists idx_prayer_requests_created_at on public.prayer_requests (created_at desc);
create index if not exists idx_prayer_supports_user_id on public.prayer_supports (user_id);

create index if not exists idx_praise_recommendations_author_id on public.praise_recommendations (author_id);
create index if not exists idx_praise_recommendations_created_at on public.praise_recommendations (created_at desc);
create index if not exists idx_praise_likes_user_id on public.praise_likes (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bootstrap_first_user_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('profiles_first_admin_bootstrap'));

  if not exists (
    select 1
    from public.profiles
    where is_admin = true
  ) then
    new.is_admin := true;
  end if;

  return new;
end;
$$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = coalesce(check_user_id, auth.uid())
      and p.is_admin = true
  );
$$;

create or replace function public.redeem_invite_code(
  p_code text,
  p_display_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_code text;
  v_display_name text;
  v_invite public.invite_codes%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select *
    into v_invite
  from public.invite_codes
  where code = v_code
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.is_redeemed then
    raise exception 'INVITE_ALREADY_REDEEMED';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  if exists (
    select 1
    from public.invite_codes i
    where i.redeemed_by = v_user_id
      and i.is_redeemed = true
  ) then
    raise exception 'USER_ALREADY_REDEEMED';
  end if;

  select u.email
    into v_user_email
  from auth.users u
  where u.id = v_user_id;

  if v_invite.invited_email is not null
     and lower(v_invite.invited_email) <> lower(coalesce(v_user_email, '')) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  v_display_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_display_name is null then
    v_display_name := nullif(btrim(v_invite.invited_name), '');
  end if;
  if v_display_name is null then
    v_display_name := '새가족';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id)
  do update
    set display_name = case
      when nullif(btrim(public.profiles.display_name), '') is null then excluded.display_name
      else public.profiles.display_name
    end,
    updated_at = now()
  returning * into v_profile;

  update public.invite_codes
  set is_redeemed = true,
      redeemed_by = v_user_id,
      redeemed_at = now(),
      updated_at = now()
  where id = v_invite.id;

  return v_profile;
end;
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

revoke all on function public.redeem_invite_code(text, text) from public;
grant execute on function public.redeem_invite_code(text, text) to authenticated;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_invite_codes_set_updated_at on public.invite_codes;
create trigger trg_invite_codes_set_updated_at
before update on public.invite_codes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_meetups_set_updated_at on public.meetups;
create trigger trg_meetups_set_updated_at
before update on public.meetups
for each row
execute function public.set_updated_at();

drop trigger if exists trg_grace_posts_set_updated_at on public.grace_posts;
create trigger trg_grace_posts_set_updated_at
before update on public.grace_posts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_prayer_requests_set_updated_at on public.prayer_requests;
create trigger trg_prayer_requests_set_updated_at
before update on public.prayer_requests
for each row
execute function public.set_updated_at();

drop trigger if exists trg_praise_recommendations_set_updated_at on public.praise_recommendations;
create trigger trg_praise_recommendations_set_updated_at
before update on public.praise_recommendations
for each row
execute function public.set_updated_at();

drop trigger if exists trg_profiles_bootstrap_first_admin on public.profiles;
create trigger trg_profiles_bootstrap_first_admin
before insert on public.profiles
for each row
execute function public.bootstrap_first_user_admin();

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_participants enable row level security;
alter table public.grace_posts enable row level security;
alter table public.grace_post_likes enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.prayer_supports enable row level security;
alter table public.praise_recommendations enable row level security;
alter table public.praise_likes enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and (
    is_admin = false
    or not exists (
      select 1
      from public.profiles p
      where p.is_admin = true
    )
  )
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    id = auth.uid()
    and is_admin = (
      select p.is_admin
      from public.profiles p
      where p.id = auth.uid()
    )
  )
);

drop policy if exists profiles_delete_admin_only on public.profiles;
create policy profiles_delete_admin_only
on public.profiles
for delete
to authenticated
using (public.is_admin());

drop policy if exists invite_codes_select_admin_only on public.invite_codes;
create policy invite_codes_select_admin_only
on public.invite_codes
for select
to authenticated
using (public.is_admin());

drop policy if exists invite_codes_insert_admin_only on public.invite_codes;
create policy invite_codes_insert_admin_only
on public.invite_codes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists invite_codes_update_admin_only on public.invite_codes;
create policy invite_codes_update_admin_only
on public.invite_codes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists invite_codes_delete_admin_only on public.invite_codes;
create policy invite_codes_delete_admin_only
on public.invite_codes
for delete
to authenticated
using (public.is_admin());

drop policy if exists meetups_select_authenticated on public.meetups;
create policy meetups_select_authenticated
on public.meetups
for select
to authenticated
using (true);

drop policy if exists meetups_insert_owner_or_admin on public.meetups;
create policy meetups_insert_owner_or_admin
on public.meetups
for insert
to authenticated
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists meetups_update_owner_or_admin on public.meetups;
create policy meetups_update_owner_or_admin
on public.meetups
for update
to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists meetups_delete_owner_or_admin on public.meetups;
create policy meetups_delete_owner_or_admin
on public.meetups
for delete
to authenticated
using (created_by = auth.uid() or public.is_admin());

drop policy if exists meetup_participants_select_authenticated on public.meetup_participants;
create policy meetup_participants_select_authenticated
on public.meetup_participants
for select
to authenticated
using (true);

drop policy if exists meetup_participants_insert_self_or_admin on public.meetup_participants;
create policy meetup_participants_insert_self_or_admin
on public.meetup_participants
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists meetup_participants_update_self_or_admin on public.meetup_participants;
create policy meetup_participants_update_self_or_admin
on public.meetup_participants
for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists meetup_participants_delete_self_or_admin on public.meetup_participants;
create policy meetup_participants_delete_self_or_admin
on public.meetup_participants
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists grace_posts_select_authenticated on public.grace_posts;
create policy grace_posts_select_authenticated
on public.grace_posts
for select
to authenticated
using (true);

drop policy if exists grace_posts_insert_owner_or_admin on public.grace_posts;
create policy grace_posts_insert_owner_or_admin
on public.grace_posts
for insert
to authenticated
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists grace_posts_update_owner_or_admin on public.grace_posts;
create policy grace_posts_update_owner_or_admin
on public.grace_posts
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists grace_posts_delete_owner_or_admin on public.grace_posts;
create policy grace_posts_delete_owner_or_admin
on public.grace_posts
for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

drop policy if exists grace_post_likes_select_authenticated on public.grace_post_likes;
create policy grace_post_likes_select_authenticated
on public.grace_post_likes
for select
to authenticated
using (true);

drop policy if exists grace_post_likes_insert_self on public.grace_post_likes;
create policy grace_post_likes_insert_self
on public.grace_post_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists grace_post_likes_delete_self_or_admin on public.grace_post_likes;
create policy grace_post_likes_delete_self_or_admin
on public.grace_post_likes
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists prayer_requests_select_authenticated on public.prayer_requests;
create policy prayer_requests_select_authenticated
on public.prayer_requests
for select
to authenticated
using (true);

drop policy if exists prayer_requests_insert_owner_or_admin on public.prayer_requests;
create policy prayer_requests_insert_owner_or_admin
on public.prayer_requests
for insert
to authenticated
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists prayer_requests_update_owner_or_admin on public.prayer_requests;
create policy prayer_requests_update_owner_or_admin
on public.prayer_requests
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists prayer_requests_delete_owner_or_admin on public.prayer_requests;
create policy prayer_requests_delete_owner_or_admin
on public.prayer_requests
for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

drop policy if exists prayer_supports_select_authenticated on public.prayer_supports;
create policy prayer_supports_select_authenticated
on public.prayer_supports
for select
to authenticated
using (true);

drop policy if exists prayer_supports_insert_self on public.prayer_supports;
create policy prayer_supports_insert_self
on public.prayer_supports
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists prayer_supports_delete_self_or_admin on public.prayer_supports;
create policy prayer_supports_delete_self_or_admin
on public.prayer_supports
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists praise_recommendations_select_authenticated on public.praise_recommendations;
create policy praise_recommendations_select_authenticated
on public.praise_recommendations
for select
to authenticated
using (true);

drop policy if exists praise_recommendations_insert_owner_or_admin on public.praise_recommendations;
create policy praise_recommendations_insert_owner_or_admin
on public.praise_recommendations
for insert
to authenticated
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists praise_recommendations_update_owner_or_admin on public.praise_recommendations;
create policy praise_recommendations_update_owner_or_admin
on public.praise_recommendations
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists praise_recommendations_delete_owner_or_admin on public.praise_recommendations;
create policy praise_recommendations_delete_owner_or_admin
on public.praise_recommendations
for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

drop policy if exists praise_likes_select_authenticated on public.praise_likes;
create policy praise_likes_select_authenticated
on public.praise_likes
for select
to authenticated
using (true);

drop policy if exists praise_likes_insert_self on public.praise_likes;
create policy praise_likes_insert_self
on public.praise_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists praise_likes_delete_self_or_admin on public.praise_likes;
create policy praise_likes_delete_self_or_admin
on public.praise_likes
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());
