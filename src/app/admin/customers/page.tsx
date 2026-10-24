import { createAdminClient } from '@/lib/supabase/server';
import { DEPOSIT_PER_CONTAINER_CENTS, formatCents } from '@/lib/constants';
import { logContainerLost, logContainerReturn } from '../actions';
import type { Customer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CustomersAdmin() {
  const supabase = createAdminClient();
  const [{ data, error }, creditResult] = await Promise.all([supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false }),
    supabase.from('glass_deposit_credits').select('email,full_name').order('full_name'),
  ]);
  if (error) throw error;
  if (creditResult.error) throw creditResult.error;

  const customers = (data ?? []) as Customer[];
  const credits = creditResult.data ?? [];
  const creditEmails = new Set(credits.map((credit) => credit.email));
  const totalOut = customers.reduce((s, c) => s + c.containers_out, 0);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Community &amp; container loop</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Customers &amp; glass tracking</h2>
      <p className="mt-2 text-sm leading-6 text-ink/55">
        {customers.length} customer{customers.length === 1 ? '' : 's'} · {totalOut} containers
        currently out. Log returns here as you collect them.
      </p>

      {credits.length > 0 && (
        <section className="admin-card mt-5 p-5 sm:p-6" aria-labelledby="glass-credits-heading">
          <h3 id="glass-credits-heading" className="font-bold text-brand-plum">Prepaid glass-container deposits</h3>
          <p className="mt-2 text-sm leading-6 text-ink/65">{credits.length} customers have a $50 deposit already paid before the website launched. Their credit applies when they register and verify the matching email.</p>
          <ul className="mt-4 divide-y divide-brand-plum/10">
            {credits.map((credit) => {
              const account = customers.find((customer) => customer.auth_user_id && customer.email.trim().toLowerCase() === credit.email);
              return (
                <li key={credit.email} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div><p className="font-bold text-brand-plum">{credit.full_name}</p><p className="break-all text-sm text-ink/55">{credit.email}</p></div>
                  <div className="text-sm sm:text-right"><p className="font-bold text-moss-700">$50 deposit already paid</p><p className="text-ink/55">{account?.glass_fee_paid_at ? 'Applied to account' : account ? 'Reserved · applies on next sign-in' : 'Reserved · awaiting account'}</p></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-5 space-y-4">
        {customers.length === 0 && (
          <p className="admin-empty-state">No customers yet. Customer and container records will appear after orders are placed.</p>
        )}

        {customers.map((c) => (
          <article key={c.id} className="admin-card overflow-hidden">
            <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-bold text-brand-plum">{c.full_name ?? c.email}</div>
                <div className="mt-1 text-sm text-ink/55">{c.email}</div>
                <div className="mt-2 text-sm font-medium text-moss-700">
                  {c.glass_fee_paid_at ? '$50 glass-container deposit already paid' : creditEmails.has(c.email.trim().toLowerCase()) ? '$50 prepaid glass credit reserved for verified account' : '$50 glass-container deposit not yet paid'}
                </div>
                {(c.address_line1 || c.zip) && (
                  <div className="mt-2 text-sm leading-6 text-ink/55">
                    {[c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(', ')}
                  </div>
                )}
                {c.delivery_notes && (
                  <div className="mt-2 rounded-control bg-cream px-3 py-2 text-sm italic text-ink/60">
                    “{c.delivery_notes}”
                  </div>
                )}
              </div>

              <div className="rounded-control bg-moss-50 px-4 py-3 text-left text-sm text-moss-700 min-[420px]:text-right">
                <div>
                  <span className="text-lg font-bold">{c.containers_out}</span> containers out
                </div>
                {c.deposit_held_cents > 0 && <div className="mt-1 text-xs font-medium">
                  {formatCents(c.deposit_held_cents)} legacy refundable deposit held
                </div>}
              </div>
            </div>

            {c.containers_out > 0 && (
              <div className="mt-5 grid gap-4 border-t border-brand-plum/10 pt-5 lg:grid-cols-[1fr_auto] lg:items-end">
                <form action={logContainerReturn} className="grid gap-3 rounded-panel bg-moss-50/70 p-4 sm:grid-cols-[auto_minmax(180px,1fr)_auto] sm:items-end">
                  <input type="hidden" name="customer_id" value={c.id} />
                  <div>
                    <label htmlFor={`return-${c.id}`} className="admin-label text-xs">Containers returned</label>
                    <input
                      id={`return-${c.id}`}
                      name="quantity"
                      type="number"
                      min={1}
                      max={c.containers_out}
                      defaultValue={c.containers_out}
                      className="admin-field w-full sm:w-24"
                    />
                  </div>
                  {c.deposit_held_cents > 0 && <label className="flex min-h-11 items-center gap-2 rounded-control bg-white px-3 text-xs font-medium text-ink/70">
                    <input type="checkbox" name="refund" defaultChecked className="h-4 w-4" />
                    Refund legacy deposit ({formatCents(DEPOSIT_PER_CONTAINER_CENTS)} each)
                  </label>}
                  <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-moss-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-moss-700">
                    Log return
                  </button>
                </form>

                <form action={logContainerLost} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-panel bg-[#fff7f4] p-4 lg:min-w-[250px]">
                  <input type="hidden" name="customer_id" value={c.id} />
                  <label htmlFor={`lost-${c.id}`} className="admin-label col-span-full text-xs">Not returned</label>
                  <input
                    id={`lost-${c.id}`}
                    name="quantity"
                    type="number"
                    min={1}
                    max={c.containers_out}
                    defaultValue={1}
                    className="admin-field mt-0 w-full"
                  />
                  <button className="admin-danger-action justify-center text-xs">
                    Mark not returned
                  </button>
                </form>
              </div>
            )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
