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
      <div className="border-b border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h1 className="font-display text-3xl font-bold md:text-4xl">
            This week&apos;s menu
          </h1>
          <p className="mt-2 max-w-2xl text-black/60">
            Everything is cooked fresh, portioned into glass, and delivered across North
            Carolina. Send the empties back with your next delivery.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <p className="rounded-xl bg-clay-100 p-4 text-sm">
            Could not load the menu. Check that your Supabase environment variables are set
            and that <code>schema.sql</code> has been run.
          </p>
        </div>
      )}

      <MenuBrowser meals={meals} />
    </>
  );
}
