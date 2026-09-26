-- Its own file: Postgres will not let an enum value be used in the transaction
-- that created it, and Supabase runs one transaction per migration file.

alter type bar_event add value if not exists 'tagged';
