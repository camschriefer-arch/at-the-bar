// Emails an invite link. Deploy with `supabase functions deploy send-invite`
// and set RESEND_API_KEY, INVITE_FROM_EMAIL and APP_INVITE_BASE_URL as secrets.
//
// The client calls invite_by_email() first and passes the returned token here,
// so this function never touches the database.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

type InviteRequest = { email: string; token: string; inviterName?: string };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'missing authorization' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } }
  );

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return json({ error: 'not authenticated' }, 401);

  const { email, token, inviterName } = (await request.json()) as InviteRequest;
  if (!email || !token) return json({ error: 'email and token are required' }, 400);

  const baseUrl = Deno.env.get('APP_INVITE_BASE_URL') ?? 'https://atthebar.app/invite';
  const link = `${baseUrl}?token=${encodeURIComponent(token)}`;
  const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'At The Bar <invites@atthebar.app>';
  const who = inviterName ?? user.user.email ?? 'A friend';

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${who} invited you to At The Bar`,
      html: `<p>${who} wants to see when you are out.</p><p><a href="${link}">Join At The Bar</a></p>`,
    }),
  });

  if (!response.ok) {
    return json({ error: `email provider returned ${response.status}` }, 502);
  }

  return json({ sent: true }, 200);
});
