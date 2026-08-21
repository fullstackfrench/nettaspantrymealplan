import { createAdminClient } from '@/lib/supabase/server';
import { DEPOSIT_PER_CONTAINER_CENTS, formatCents } from '@/lib/constants';
import { logContainerLost, logContainerReturn } from '../actions';
import type { Customer } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CustomersAdmin() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  const customers = (data ?? []) as Customer[];
  const totalOut = customers.reduce((s, c) => s + c.containers_out, 0);

  return (
    <div>
      <h2 className="font-display text-xl font-bold">Customers &amp; glass tracking</h2>
      <p className="mt-1 text-sm text-black/50">
        {customers.length} customer{customers.length === 1 ? '' : 's'} · {totalOut} containers
        currently out. Log returns here as you collect them.
      </p>

      <div className="mt-5 space-y-4">
        {customers.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-sm text-black/50 ring-1 ring-black/5">
            No customers yet.
          </p>
        )}

        {customers.map((c) => (
          <div key={c.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{c.full_name ?? c.email}</div>
                <div className="text-sm text-black/50">{c.email}</div>
                {(c.address_line1 || c.zip) && (
                  <div className="mt-1 text-sm text-black/50">
                    {[c.address_line1, c.city, c.state, c.zip].filter(Boolean).join(', ')}
                  </div>
                )}
                {c.delivery_notes && (
                  <div className="mt-1 text-sm italic text-black/50">
                    “{c.delivery_notes}”
                  </div>
                )}
              </div>

              <div className="text-right text-sm">
                <div>
                  <span className="font-semibold">{c.containers_out}</span> containers out
                </div>
                <div className="text-black/50">
                  {formatCents(c.deposit_held_cents)} deposit held
                </div>
              </div>
            </div>

            {c.containers_out > 0 && (
              <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-black/10 pt-4">
                <form action={logContainerReturn} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="customer_id" value={c.id} />
                  <div>
                    <label className="text-xs font-medium">Containers returned</label>
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      max={c.containers_out}
                      defaultValue={c.containers_out}
                      className="mt-1 w-24 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15"
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-xs">
                    <input type="checkbox" name="refund" defaultChecked className="h-4 w-4" />
                    Refund deposit ({formatCents(DEPOSIT_PER_CONTAINER_CENTS)} each)
                  </label>
                  <button className="rounded-full bg-moss-600 px-4 py-2 text-xs font-semibold text-white hover:bg-moss-700">
                    Log return
                  </button>
                </form>

                <form action={logContainerLost} className="flex items-end gap-2">
                  <input type="hidden" name="customer_id" value={c.id} />
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={c.containers_out}
                    defaultValue={1}
                    className="w-20 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15"
                  />
                  <button className="pb-2 text-xs text-clay-500 hover:underline">
                    Mark not returned
                  </button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
