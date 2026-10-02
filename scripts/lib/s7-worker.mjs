// Provider calls are deliberately injectable. Database tokens fence every dispatch.
const titles = { uk: 'Ваша добірка подій готова', en: 'Your event selection is ready', es: 'Tu selección de eventos está lista' };
export async function rpc(admin, name, params = {}) {
 const result = await admin.rpc(name, params).abortSignal(AbortSignal.timeout(10000));
 if (result.error) throw Error('S7 database operation failed: ' + name);
 return result.data;
}
function headers() {
 return { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.EXPO_ACCESS_TOKEN } : {}) };
}
export async function sendTicket(payload, send = fetch) {
 try {
  // One request per device, sequential, at most one connection. Explicit rejection
  // can retry; lost/malformed responses remain uncertain to avoid blind duplicates.
  const response = await send('https://exp.host/--/api/v2/push/send', {
   method: 'POST', headers: headers(), body: JSON.stringify([payload]), signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429) return { result: 'retry', error: 'rate_limited' };
  if (!response.ok) return { result: response.status >= 500 ? 'uncertain' : 'rejected', error: 'http_' + response.status };
  const data = (await response.json())?.data;
  const ticket = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0 && ticket.id.length <= 200) return { result: 'accepted', ticket: ticket.id };
  if (ticket?.status === 'error' && typeof ticket.details?.error === 'string') {
   const error = ticket.details.error.slice(0, 100);
   return { result: error === 'MessageRateExceeded' ? 'retry' : 'rejected', error };
  }
 } catch { /* A request might already have reached Expo; never automatically resend. */ }
 return { result: 'uncertain', error: 'response_unknown' };
}
export async function processS7Job(admin, transport = 'fixture', send = fetch) {
 if (!['fixture', 'expo'].includes(transport)) throw Error('Invalid S7 transport');
 const claim = await rpc(admin, 'claim_s7_notification');
 if (claim.status !== 'claimed') return claim.status;
 const job = await admin.from('notification_jobs').select('user_id').eq('id', claim.id).single().abortSignal(AbortSignal.timeout(10000));
 if (job.error) throw Error('S7 owner lookup unavailable');
 const devices = [];
 for (let offset = 0; ; offset += 100) {
  const page = await admin.from('device_tokens').select('id').eq('user_id', job.data.user_id).order('id').range(offset, offset + 99).abortSignal(AbortSignal.timeout(10000));
  if (page.error) throw Error('S7 devices unavailable');
  devices.push(...page.data);
  if (page.data.length < 100) break;
 }
 for (const device of devices) {
  const begin = await rpc(admin, 'begin_s7_delivery', { selected_job: claim.id, claim: claim.token, device: device.id });
  if (begin.status === 'lost_lease') return 'lost_lease'; // Next owner resumes, terminal device attempts are retained.
  if (begin.status !== 'dispatch') continue;
  const outcome = transport === 'fixture' ? { result: 'fixture_recorded' } : await sendTicket({
   to: begin.device_token, title: titles[begin.locale] ?? titles.uk, body: 'Event Radar',
   data: { digest_id: begin.digest_id }, channelId: 'digests', ttl: 3600,
  }, send);
  await rpc(admin, 'finish_s7_delivery', { selected_delivery: begin.delivery_id, claim: claim.token, ...outcome });
 }
 await rpc(admin, 'finish_s7_notification', { selected_job: claim.id, claim: claim.token });
 return transport === 'fixture' ? 'fixture_finished' : 'processed';
}
export async function checkS7Receipts(admin, send = fetch) {
 const query = await admin.from('deliveries').select('id,receipt_id,dispatched_at,notification_jobs!inner(workflow)')
  .eq('notification_jobs.workflow', 's7').eq('status', 'accepted').lte('next_receipt_at', new Date().toISOString())
  .order('next_receipt_at').limit(1000).abortSignal(AbortSignal.timeout(10000));
 if (query.error) throw Error('S7 receipt lookup failed');
 const rows = query.data;
 if (!rows.length) return 0;
 let receipts = {};
 try {
  const response = await send('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: headers(),
   body: JSON.stringify({ ids: rows.map(row => row.receipt_id) }), signal: AbortSignal.timeout(15000) });
  if (response.ok) {
   const data = (await response.json())?.data;
   if (data && typeof data === 'object' && !Array.isArray(data)) receipts = data;
  }
 } catch { /* Receipt queries can safely repeat; they never resend a push. */ }
 for (const row of rows) {
  const receipt = receipts[row.receipt_id];
  const result = receipt?.status === 'ok' ? 'ok' : receipt?.status === 'error' ? 'error' : 'missing';
  await rpc(admin, 'finish_s7_receipt', { selected_delivery: row.id, result,
   error: result === 'error' ? String(receipt.details?.error ?? 'ReceiptError').slice(0, 100) : null });
 }
 return rows.length;
}
