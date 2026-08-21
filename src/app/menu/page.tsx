import MenuBrowser from '@/components/MenuBrowser';
import { getActiveSubscriptionPlans, getPublicMeals } from '@/lib/catalog';
import type { Meal, PublicSubscriptionPlan } from '@/lib/types';

// Re-fetch every 60s so the chef's edits show up without a redeploy.
export const revalidate = 60;

export default async function MenuPage() {
  let meals: Meal[] = [];
  let plans: PublicSubscriptionPlan[] = [];
  let loadFailed = false;
  try {
    [meals, plans] = await Promise.all([getPublicMeals(), getActiveSubscriptionPlans()]);
  } catch {
    loadFailed = true;
  }

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

      {loadFailed && (
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <p className="rounded-xl bg-clay-100 p-4 text-sm">
            Could not load the menu. Check that your Supabase environment variables are set
            and that <code>schema.sql</code> has been run.
          </p>
        </div>
      )}

      <MenuBrowser meals={meals} plans={plans} />
    </>
  );
}
