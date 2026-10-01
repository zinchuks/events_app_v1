import { createHash } from 'node:crypto';
function ok(response) { if (response.error) throw Error(response.error.code); return response.data; }
function stableId(value) { return createHash('md5').update(value).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); }
export async function processS3Job(admin, transport, send = fetch, selectedJob = null) {
 if (!['fixture', 'expo'].includes(transport)) throw Error('Unknown transport');
 const jobs = ok(await admin.rpc('claim_s3_notification', { job_transport: transport, selected_job: selectedJob }));
 const job = jobs[0]; if (!job) return null;
 try {
  if (transport === 'fixture') {
   // This is a DB-only transport fixture; it never contacts Expo or a device.
   ok(await admin.from('deliveries').upsert({ id: stableId(job.id + ':fixture'), job_id: job.id, user_id: job.user_id, status: 'fixture_recorded', receipt_id: null }));
  } else {
   const profile = ok(await admin.from('profiles').select('push_enabled,locale').eq('id', job.user_id).single());
   const tokens = profile.push_enabled ? ok(await admin.from('device_tokens').select('id,token').eq('user_id', job.user_id)) : [];
   if (!tokens.length) {
    ok(await admin.from('deliveries').insert({ job_id: job.id, user_id: job.user_id, status: 'skipped_opt_out' }));
   } else {
    const titles = { uk: 'Ваша добірка подій готова', en: 'Your event selection is ready', es: 'Tu selección de eventos está lista' };
    for (let offset = 0; offset < tokens.length; offset += 100) {
     const batch = tokens.slice(offset, offset + 100);
     if (batch.some(t => !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(t.token))) throw Error('Invalid stored Expo token');
     const response = await send('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.EXPO_ACCESS_TOKEN } : {}) },
      body: JSON.stringify(batch.map(t => ({ to: t.token, title: titles[profile.locale] ?? titles.uk, body: 'Event Radar', data: { digest_id: job.digest_id }, channelId: 'digests' }))), signal: AbortSignal.timeout(15000)
     });
     if (!response.ok) throw Error('Expo HTTP ' + response.status);
     const result = await response.json(); const tickets = result.data;
     if (!Array.isArray(tickets) || tickets.length !== batch.length) throw Error('Invalid Expo ticket response');
     for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]; const accepted = ticket.status === 'ok' && typeof ticket.id === 'string';
      ok(await admin.from('deliveries').insert({ job_id: job.id, user_id: job.user_id, device_token_id: batch[i].id, status: accepted ? 'accepted' : 'rejected', receipt_id: accepted ? ticket.id : null, error_code: accepted ? null : ticket.details?.error ?? 'unknown' }));
      if (ticket.details?.error === 'DeviceNotRegistered') ok(await admin.from('device_tokens').delete().eq('id', batch[i].id).eq('user_id', job.user_id));
     }
    }
   }
  }
  ok(await admin.from('notification_jobs').update({ status: 'sent', lease_until: null }).eq('id', job.id));
  return { id: job.id, transport, status: transport === 'fixture' ? 'fixture_recorded' : 'processed_not_delivery_proof' };
 } catch (error) {
  // No automatic Expo retry after an ambiguous response: avoid blindly duplicating push.
  await admin.from('notification_jobs').update({ status: 'failed', lease_until: null }).eq('id', job.id);
  throw error;
 }
}
export async function checkS3Receipts(admin, send = fetch) {
 const pending = ok(await admin.from('deliveries').select('id,receipt_id,device_token_id,user_id').eq('status', 'accepted').limit(1000));
 if (!pending.length) return { checked: 0 };
 const response = await send('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.EXPO_ACCESS_TOKEN } : {}) }, body: JSON.stringify({ ids: pending.map(d => d.receipt_id) }), signal: AbortSignal.timeout(15000) });
 if (!response.ok) throw Error('Expo receipts HTTP ' + response.status);
 const result = await response.json(); if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw Error('Invalid receipts response');
 let checked = 0;
 for (const row of pending) {
  const receipt = result.data[row.receipt_id]; if (!receipt) continue;
  ok(await admin.from('deliveries').update({ status: receipt.status === 'ok' ? 'receipt_ok' : 'receipt_error', error_code: receipt.details?.error ?? null }).eq('id', row.id));
  if (receipt.details?.error === 'DeviceNotRegistered' && row.device_token_id) ok(await admin.from('device_tokens').delete().eq('id', row.device_token_id).eq('user_id', row.user_id));
  checked++;
 }
 return { checked };
}
