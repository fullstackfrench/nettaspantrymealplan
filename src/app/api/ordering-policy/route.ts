import { NextResponse } from 'next/server';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import { weeklyOrderingPolicy } from '@/lib/account/ordering-policy';
import { GLASS_CONTAINER_DEPOSIT_CENTS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const admin = createAdminClient();
    const policy = await weeklyOrderingPolicy(admin);
    const { data: { user } } = await createSessionClient().auth.getUser();
    let paid = false;
    if (user?.email_confirmed_at) {
      const customer = await admin.from('customers').select('glass_fee_paid_at').eq('auth_user_id', user.id).maybeSingle();
      if (customer.error) throw customer.error;
      paid = Boolean(customer.data?.glass_fee_paid_at);
    }
    return NextResponse.json({ orderingOpen: Boolean(policy?.ordering_open), closesAt: policy?.closes_at ?? null,
      glassFeeCents: paid ? 0 : GLASS_CONTAINER_DEPOSIT_CENTS }, { headers });
  } catch {
    return NextResponse.json({ error: 'Ordering availability could not be checked.' }, { status: 503, headers });
  }
}
