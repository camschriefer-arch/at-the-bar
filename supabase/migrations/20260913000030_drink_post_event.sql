-- A posted drink is news to your friends too. Unlike an arrival, the venue is
-- named in the body: the post itself carries the bar name to the same audience,
-- so withholding it from the push would protect nothing.
--
-- The value is added on its own because Postgres refuses to use a new enum
-- value in the transaction that created it, and Supabase runs one transaction
-- per migration file.

alter type bar_event add value if not exists 'posted';
