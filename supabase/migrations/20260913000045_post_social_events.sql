-- Values are added on their own because Postgres refuses to use a new enum
-- value in the transaction that created it, and Supabase runs one transaction
-- per migration file.

alter type bar_event add value if not exists 'commented';

alter type bar_event add value if not exists 'reacted';
