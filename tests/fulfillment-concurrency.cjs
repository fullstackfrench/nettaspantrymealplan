const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const exec = promisify(execFile);
const enabled = process.env.RUN_FULFILLMENT_DATABASE_TESTS === 'true';
const database = process.env.FULFILLMENT_TEST_DATABASE || 'netta_fulfillment_v2';
async function sql(query) {
  assert.match(database, /^netta_fulfillment(?:_v\d+)?$/);
  return (await exec('psql', ['-h', '/private/tmp', '-p', '55443', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atc', query])).stdout.trim();
}
test('concurrent Packed/Delivered requests create each milestone, email, and container issuance exactly once', { skip: !enabled }, async () => {
  const order = randomUUID();
  const actor = '10000000-0000-4000-8000-000000000001';
  await sql(`insert into orders(id,customer_id,status,payment_status,fulfillment_status,paid_at,subtotal_cents,total_cents,deposit_cents,containers_issued) values('${order}','20000000-0000-4000-8000-000000000001','paid','paid','unfulfilled',now(),6000,6900,900,3);insert into order_items(order_id,meal_id,quantity,unit_price_cents) values('${order}','30000000-0000-4000-8000-000000000001',3,2000);`);
  for (const stage of ['packed', 'delivered']) {
    const transition = `begin;set local role service_role;select transition_order_fulfillment('${order}','${stage}','${actor}');select pg_sleep(0.2);commit;`;
    await Promise.all([sql(transition), sql(transition), sql(transition)]);
  }
  assert.equal(await sql(`select fulfillment_status from orders where id='${order}'`), 'delivered');
  assert.equal(await sql(`select count(*) from order_fulfillment_history where order_id='${order}'`), '3');
  assert.equal(await sql(`select count(*) from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id='${order}'`), '3');
  assert.equal(await sql(`select count(*) from container_events where order_id='${order}' and kind='issued'`), '1');
  const timestamp = await sql(`select delivered_at from orders where id='${order}'`);
  await sql(`set role service_role;select transition_order_fulfillment('${order}','delivered','${actor}');`);
  assert.equal(await sql(`select delivered_at from orders where id='${order}'`), timestamp);
});
