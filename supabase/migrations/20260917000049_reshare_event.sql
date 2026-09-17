-- Added on its own because Postgres refuses to use a new enum value in the
-- transaction that created it, and Supabase runs one transaction per file.

alter type bar_event add value if not exists 'reshared';
