import MenuBrowser from '@/components/MenuBrowser';
import { createServerClient } from '@/lib/supabase/server';
import type { Meal } from '@/lib/types';

// Re-fetch every 60s so the chef's edits show up without a redeploy.
export const revalidate = 60;

export default async function MenuPage() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const meals = (data ?? []) as Meal[];

  return (
    <>
      <div className="relative overflow-hidden border-b border-brand-plum/10 bg-white">
        <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Fresh from Chef Netta&apos;s kitchen</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-brand-plum md:text-5xl">
            This week&apos;s menu
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-ink/65">
            Everything is cooked fresh, portioned into glass, and delivered across North
            Carolina. Send the empties back with your next delivery.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
          <p className="rounded-panel border border-brand-brick/20 bg-clay-100 p-4 text-sm text-ink/75">
            Could not load the menu. Check that your Supabase environment variables are set
            and that <code>schema.sql</code> has been run.
          </p>
        </div>
      )}

      <MenuBrowser meals={meals} />
    </>
  );
}
