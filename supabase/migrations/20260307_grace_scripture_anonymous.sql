-- Grace anonymity + NKRV scripture range persistence.

alter table public.grace_posts
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists scripture_book_id text,
  add column if not exists scripture_book_name text,
  add column if not exists scripture_start_chapter integer,
  add column if not exists scripture_start_verse integer,
  add column if not exists scripture_end_chapter integer,
  add column if not exists scripture_end_verse integer,
  add column if not exists scripture_reference text,
  add column if not exists scripture_text text;

alter table public.grace_posts
  drop constraint if exists grace_posts_scripture_book_id_check;

alter table public.grace_posts
  add constraint grace_posts_scripture_book_id_check
  check (scripture_book_id is null or scripture_book_id ~ '^[0-9]{1,3}$');

alter table public.grace_posts
  drop constraint if exists grace_posts_scripture_range_check;

alter table public.grace_posts
  add constraint grace_posts_scripture_range_check
  check (
    (
      scripture_book_id is null
      and scripture_book_name is null
      and scripture_start_chapter is null
      and scripture_start_verse is null
      and scripture_end_chapter is null
      and scripture_end_verse is null
      and scripture_reference is null
      and scripture_text is null
    )
    or
    (
      scripture_book_id is not null
      and scripture_book_name is not null
      and scripture_start_chapter is not null and scripture_start_chapter > 0
      and scripture_start_verse is not null and scripture_start_verse > 0
      and scripture_end_chapter is not null and scripture_end_chapter > 0
      and scripture_end_verse is not null and scripture_end_verse > 0
      and char_length(btrim(scripture_reference)) between 1 and 120
      and char_length(btrim(scripture_text)) between 1 and 20000
      and (
        scripture_end_chapter > scripture_start_chapter
        or (scripture_end_chapter = scripture_start_chapter and scripture_end_verse >= scripture_start_verse)
      )
    )
  );

alter table public.prayer_requests
  alter column is_anonymous set default false,
  alter column is_anonymous set not null;
