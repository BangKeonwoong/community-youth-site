-- Realtime chat rooms and threaded comments support.

create table if not exists public.chat_rooms (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_rooms
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists created_by uuid,
  add column if not exists last_message_at timestamptz,
  add column if not exists is_archived boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.chat_rooms
  alter column description set default '',
  alter column is_archived set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.chat_rooms
  drop constraint if exists chat_rooms_name_length_check;

alter table public.chat_rooms
  add constraint chat_rooms_name_length_check
  check (char_length(btrim(name)) between 2 and 60);

alter table public.chat_rooms
  drop constraint if exists chat_rooms_description_length_check;

alter table public.chat_rooms
  add constraint chat_rooms_description_length_check
  check (char_length(description) <= 500);

create index if not exists idx_chat_rooms_created_by
  on public.chat_rooms (created_by);

create index if not exists idx_chat_rooms_last_message_at
  on public.chat_rooms (last_message_at desc nulls last, created_at desc);


create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists room_id bigint,
  add column if not exists author_id uuid,
  add column if not exists content text,
  add column if not exists is_deleted boolean,
  add column if not exists deleted_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.chat_messages
  alter column is_deleted set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.chat_messages
  drop constraint if exists chat_messages_content_length_check;

alter table public.chat_messages
  add constraint chat_messages_content_length_check
  check (char_length(btrim(content)) between 1 and 2000);

create index if not exists idx_chat_messages_room_created_at
  on public.chat_messages (room_id, created_at asc);

create index if not exists idx_chat_messages_author_id
  on public.chat_messages (author_id);


create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_type text not null,
  post_id bigint not null,
  parent_comment_id bigint references public.post_comments(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_comments
  add column if not exists post_type text,
  add column if not exists post_id bigint,
  add column if not exists parent_comment_id bigint,
  add column if not exists author_id uuid,
  add column if not exists content text,
  add column if not exists is_deleted boolean,
  add column if not exists deleted_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.post_comments
  alter column is_deleted set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.post_comments
  drop constraint if exists post_comments_post_type_check;

alter table public.post_comments
  add constraint post_comments_post_type_check
  check (post_type in ('meetup', 'grace', 'prayer', 'praise'));

alter table public.post_comments
  drop constraint if exists post_comments_content_length_check;

alter table public.post_comments
  add constraint post_comments_content_length_check
  check (char_length(btrim(content)) between 1 and 1000);

create index if not exists idx_post_comments_post_scope
  on public.post_comments (post_type, post_id, created_at asc);

create index if not exists idx_post_comments_parent
  on public.post_comments (parent_comment_id);

create index if not exists idx_post_comments_author
  on public.post_comments (author_id);


create or replace function public.protect_chat_message_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.room_id <> old.room_id
    or new.author_id <> old.author_id
    or new.created_at <> old.created_at then
    raise exception 'CHAT_MESSAGE_IMMUTABLE_FIELDS';
  end if;

  return new;
end;
$$;

create or replace function public.validate_post_comment_target()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean := false;
  v_parent public.post_comments%rowtype;
begin
  if new.post_type = 'meetup' then
    select exists(select 1 from public.meetups m where m.id = new.post_id) into v_exists;
  elsif new.post_type = 'grace' then
    select exists(select 1 from public.grace_posts g where g.id = new.post_id) into v_exists;
  elsif new.post_type = 'prayer' then
    select exists(select 1 from public.prayer_requests p where p.id = new.post_id) into v_exists;
  elsif new.post_type = 'praise' then
    select exists(select 1 from public.praise_recommendations r where r.id = new.post_id) into v_exists;
  else
    raise exception 'INVALID_POST_TYPE';
  end if;

  if not v_exists then
    raise exception 'POST_NOT_FOUND';
  end if;

  if new.parent_comment_id is not null then
    select *
      into v_parent
    from public.post_comments
    where id = new.parent_comment_id;

    if not found then
      raise exception 'PARENT_COMMENT_NOT_FOUND';
    end if;

    if v_parent.post_type <> new.post_type or v_parent.post_id <> new.post_id then
      raise exception 'PARENT_COMMENT_SCOPE_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_post_comment_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.post_type <> old.post_type
    or new.post_id <> old.post_id
    or coalesce(new.parent_comment_id, -1) <> coalesce(old.parent_comment_id, -1)
    or new.author_id <> old.author_id
    or new.created_at <> old.created_at then
    raise exception 'POST_COMMENT_IMMUTABLE_FIELDS';
  end if;

  return new;
end;
$$;

create or replace function public.sync_chat_room_last_message_at()
returns trigger
language plpgsql
as $$
begin
  update public.chat_rooms
     set last_message_at = case
       when last_message_at is null then new.created_at
       when new.created_at > last_message_at then new.created_at
       else last_message_at
     end
   where id = new.room_id;

  return new;
end;
$$;


drop trigger if exists trg_chat_rooms_set_updated_at on public.chat_rooms;
create trigger trg_chat_rooms_set_updated_at
before update on public.chat_rooms
for each row
execute function public.set_updated_at();

drop trigger if exists trg_chat_messages_set_updated_at on public.chat_messages;
create trigger trg_chat_messages_set_updated_at
before update on public.chat_messages
for each row
execute function public.set_updated_at();

drop trigger if exists trg_post_comments_set_updated_at on public.post_comments;
create trigger trg_post_comments_set_updated_at
before update on public.post_comments
for each row
execute function public.set_updated_at();

drop trigger if exists trg_chat_messages_protect_immutable on public.chat_messages;
create trigger trg_chat_messages_protect_immutable
before update on public.chat_messages
for each row
execute function public.protect_chat_message_immutable_fields();

drop trigger if exists trg_post_comments_validate_target on public.post_comments;
create trigger trg_post_comments_validate_target
before insert or update on public.post_comments
for each row
execute function public.validate_post_comment_target();

drop trigger if exists trg_post_comments_protect_immutable on public.post_comments;
create trigger trg_post_comments_protect_immutable
before update on public.post_comments
for each row
execute function public.protect_post_comment_immutable_fields();

drop trigger if exists trg_chat_messages_sync_last_message_at on public.chat_messages;
create trigger trg_chat_messages_sync_last_message_at
after insert on public.chat_messages
for each row
execute function public.sync_chat_room_last_message_at();


alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.post_comments enable row level security;

-- chat_rooms policies

drop policy if exists chat_rooms_select_authenticated on public.chat_rooms;
create policy chat_rooms_select_authenticated
on public.chat_rooms
for select
to authenticated
using (true);

drop policy if exists chat_rooms_insert_authenticated on public.chat_rooms;
create policy chat_rooms_insert_authenticated
on public.chat_rooms
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists chat_rooms_update_owner_or_admin on public.chat_rooms;
create policy chat_rooms_update_owner_or_admin
on public.chat_rooms
for update
to authenticated
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists chat_rooms_delete_owner_or_admin on public.chat_rooms;
create policy chat_rooms_delete_owner_or_admin
on public.chat_rooms
for delete
to authenticated
using (created_by = auth.uid() or public.is_admin());

-- chat_messages policies

drop policy if exists chat_messages_select_authenticated on public.chat_messages;
create policy chat_messages_select_authenticated
on public.chat_messages
for select
to authenticated
using (true);

drop policy if exists chat_messages_insert_self on public.chat_messages;
create policy chat_messages_insert_self
on public.chat_messages
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists chat_messages_update_author_or_admin on public.chat_messages;
create policy chat_messages_update_author_or_admin
on public.chat_messages
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

-- post_comments policies

drop policy if exists post_comments_select_authenticated on public.post_comments;
create policy post_comments_select_authenticated
on public.post_comments
for select
to authenticated
using (true);

drop policy if exists post_comments_insert_self on public.post_comments;
create policy post_comments_insert_self
on public.post_comments
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists post_comments_update_author_or_admin on public.post_comments;
create policy post_comments_update_author_or_admin
on public.post_comments
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());


grant select, insert, update, delete on table public.chat_rooms to authenticated;
grant select, insert, update on table public.chat_messages to authenticated;
grant select, insert, update on table public.post_comments to authenticated;


do $$
begin
  if exists (
    select 1
    from pg_publication p
    where p.pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'chat_rooms'
    ) then
      alter publication supabase_realtime add table public.chat_rooms;
    end if;

    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'chat_messages'
    ) then
      alter publication supabase_realtime add table public.chat_messages;
    end if;

    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'post_comments'
    ) then
      alter publication supabase_realtime add table public.post_comments;
    end if;
  end if;
end;
$$;
