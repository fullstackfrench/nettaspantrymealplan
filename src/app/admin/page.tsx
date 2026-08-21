import { createAdminClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const supabase = createAdminClient();

  const [{ count: mealCount }, { count: openOrders }, { data: customers }] =
    await Promise.all([
      supabase.from('meals').select('*', { count: 'exact', head: true }),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['paid', 'packing', 'out_for_delivery']),
      supabase.from('customers').select('containers_out, deposit_held_cents'),
    ]);

  const glassOut = (customers ?? []).reduce((s, c) => s + (c.containers_out ?? 0), 0);
  const depositHeld = (customers ?? []).reduce(
    (s, c) => s + (c.deposit_held_cents ?? 0),
    0
  );

  return (
    <section aria-labelledby="overview-heading">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Today at a glance</p>
      <h2 id="overview-heading" className="mt-1 font-display text-2xl font-bold text-brand-plum">Kitchen overview</h2>
      <p className="mt-2 text-sm text-ink/55">The operational numbers that need your attention.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Meals in library" value={String(mealCount ?? 0)} tone="plum" />
        <Stat label="Orders to fulfill" value={String(openOrders ?? 0)} tone="brick" />
        <Stat label="Containers out" value={String(glassOut)} tone="moss" />
        <Stat label="Deposits held" value={formatCents(depositHeld)} tone="gold" />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'plum' | 'brick' | 'moss' | 'gold' }) {
  const accent = { plum: 'bg-brand-plum', brick: 'bg-brand-brick', moss: 'bg-moss-600', gold: 'bg-brand-gold' }[tone];
  return (
    <div className="admin-card relative overflow-hidden p-5 sm:p-6">
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <div className="text-3xl font-bold tracking-tight text-brand-plum">{value}</div>
      <div className="mt-2 text-sm font-medium text-ink/55">{label}</div>
    </div>
  );
}
