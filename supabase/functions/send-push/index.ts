// Drains the notification outbox to the Expo push service. Deploy with
// `supabase functions deploy send-push`; SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Takes no input and is safe to call concurrently: claim_push_batch locks the
// rows it hands out. The app calls it right after a check-in for low latency,
// and a pg_cron schedule (see README) sweeps up anything a dropped request left
// behind.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type OutboxRow = {
  id: number;
  recipient_id: string;
  actor_id: string;
  event: 'arrived' | 'left';
  body: string;
  token: string;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
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

  const { data, error } = await supabase.rpc('claim_push_batch', { p_limit: BATCH_SIZE });
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return json({ sent: 0 }, 200);

  const messages = rows.map((row) => ({
    to: row.token,
    title: 'At The Bar',
    body: row.body,
    sound: 'default',
    channelId: 'bar-events',
    priority: 'high',
    // The tap handler opens the friend, who is only rendered if the viewer is
    // still allowed to see them, so no bar detail travels in the payload.
    data: { friendId: row.actor_id, event: row.event },
  }));

  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    await supabase.rpc('mark_push_failed', {
      p_ids: rows.map((row) => row.id),
      p_error: `expo returned ${response.status}`,
    });
    return json({ error: `expo returned ${response.status}` }, 502);
  }

  const tickets = ((await response.json()) as { data?: ExpoTicket[] }).data ?? [];
  const sent: number[] = [];
  const failed: number[] = [];
  const staleTokens: string[] = [];
  let lastError = 'unknown expo error';

  rows.forEach((row, index) => {
    const ticket = tickets[index];
    if (!ticket || ticket.status === 'ok') {
      sent.push(row.id);
      return;
    }

    lastError = ticket.message ?? lastError;
    if (ticket.details?.error === 'DeviceNotRegistered') {
      staleTokens.push(row.token);
      sent.push(row.id);
    } else {
      failed.push(row.id);
    }
  });

  if (staleTokens.length > 0) {
    await supabase.rpc('drop_push_tokens', { p_tokens: staleTokens });
  }
  if (sent.length > 0) {
    await supabase.rpc('mark_push_sent', { p_ids: sent });
  }
  if (failed.length > 0) {
    await supabase.rpc('mark_push_failed', { p_ids: failed, p_error: lastError });
  }

  await supabase.rpc('prune_notification_outbox');

  return json({ sent: sent.length, failed: failed.length }, 200);
});
