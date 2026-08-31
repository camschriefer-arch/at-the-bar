// Drains the email outbox through Resend. Deploy with
// `supabase functions deploy send-email` and set RESEND_API_KEY and
// INVITE_FROM_EMAIL as secrets; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected by the platform.
//
// Takes no input and is safe to call concurrently: claim_email_batch locks the
// rows it hands out. The app calls it right after removing a friend, and the
// pg_cron sweep (see README) picks up anything a dropped request left behind.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BATCH_SIZE = 50;

type OutboxRow = {
  id: number;
  recipient_email: string;
  subject: string;
  body_html: string;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.rpc('claim_email_batch', { p_limit: BATCH_SIZE });
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return json({ sent: 0 }, 200);

  const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'At The Bar <invites@atthebar.app>';
  const sent: number[] = [];
  const failed: number[] = [];
  let lastError = 'unknown email error';

  for (const row of rows) {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [row.recipient_email],
        subject: row.subject,
        html: row.body_html,
      }),
    });

    if (response.ok) {
      sent.push(row.id);
    } else {
      lastError = `email provider returned ${response.status}`;
      failed.push(row.id);
    }
  }

  if (sent.length > 0) {
    await supabase.rpc('mark_email_sent', { p_ids: sent });
  }
  if (failed.length > 0) {
    await supabase.rpc('mark_email_failed', { p_ids: failed, p_error: lastError });
  }

  await supabase.rpc('prune_email_outbox');

  return json({ sent: sent.length, failed: failed.length }, 200);
});
