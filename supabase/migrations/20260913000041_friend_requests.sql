-- Lets you reach someone you are not friends with — a commenter on a friend's
-- photo — see nothing but their name and picture, and ask to be friends.

-- The value is added on its own because Postgres refuses to use a new enum
-- value in the transaction that created it, and Supabase runs one transaction
-- per migration file.
alter type bar_event add value if not exists 'requested';
