import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';

export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

type CustomerIdentity = {
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
};

type RecentOrderRow = {
  id: string;
  created_at: string;
  order_type: string;
  total_cents: number;
  payment_status: string;
  fulfillment_status: string;
  customers: CustomerIdentity | null;
  order_items: { quantity: number }[] | null;
};

type PaidOrderRow = {
  customer_id: string;
  created_at: string;
  total_cents: number;
  customers: Pick<CustomerIdentity, 'auth_user_id' | 'email'> | null;
  order_items: {
    quantity: number;
    meal_name_snapshot: string | null;
    meals: { name: string } | null;
  }[] | null;
};

type TrendOrderRow = { created_at: string; payment_status: string };

export type AdminDashboardData = {
  range: DashboardRange;
  stats: {
    orders: number;
    paidOrders: number;
    paidRevenueCents: number;
    repeatCustomers: number;
    awaitingFulfillment: number;
    unpaidAttention: number;
  };
  trend: { date: string; label: string; orders: number }[];
  topMeals: { name: string; quantity: number }[];
  customerMix: { newCustomers: number; repeatCustomers: number };
  recentOrders: {
    id: string;
    createdAt: string;
    customerName: string;
    customerEmail: string;
    orderType: string;
    mealUnits: number;
    totalCents: number;
    paymentStatus: string;
    fulfillmentStatus: string;
  }[];
};

const BUSINESS_TIME_ZONE = 'America/New_York';

export async function getAdminDashboardData(range: DashboardRange): Promise<AdminDashboardData> {
  const supabase = createAdminClient();
  const now = new Date();
  const earliestTrendDate = new Date(now);
  earliestTrendDate.setUTCDate(earliestTrendDate.getUTCDate() - 89);
  earliestTrendDate.setUTCHours(0, 0, 0, 0);

  const [recentResult, trendResult, paidResult, fulfillmentResult, unpaidResult] = await Promise.all([
    supabase
      .from('orders')
      .select('id, created_at, order_type, total_cents, payment_status, fulfillment_status, customers(auth_user_id, email, full_name), order_items(quantity)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('orders')
      .select('created_at, payment_status')
      .gte('created_at', earliestTrendDate.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select('customer_id, created_at, total_cents, customers(auth_user_id, email), order_items(quantity, meal_name_snapshot, meals(name))')
      .eq('payment_status', 'paid'),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'paid')
      .in('fulfillment_status', ['unfulfilled', 'packing', 'out_for_delivery']),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('payment_status', ['unpaid', 'processing', 'failed'])
      .neq('fulfillment_status', 'canceled'),
  ]);

  const error = [recentResult.error, trendResult.error, paidResult.error, fulfillmentResult.error, unpaidResult.error].find(Boolean);
  if (error) throw new Error(`Unable to load admin dashboard: ${error.message}`);

  const recent = (recentResult.data ?? []) as unknown as RecentOrderRow[];
  const trendOrders = (trendResult.data ?? []) as TrendOrderRow[];
  const paidOrders = (paidResult.data ?? []) as unknown as PaidOrderRow[];
  const trend = buildTrend(trendOrders, range, now);
  const rangeStart = trend[0]?.date;
  const paidInRange = paidOrders.filter((order) => !rangeStart || dateKey(order.created_at) >= rangeStart);
  const allOrdersInRange = trendOrders.filter((order) => !rangeStart || dateKey(order.created_at) >= rangeStart);

  const customerOrderCounts = new Map<string, number>();
  for (const order of paidOrders) {
    const identity = analyticsCustomerKey(order);
    customerOrderCounts.set(identity, (customerOrderCounts.get(identity) ?? 0) + 1);
  }
  const customerCounts = Array.from(customerOrderCounts.values());
  const repeatCustomers = customerCounts.filter((count) => count > 1).length;

  const mealQuantities = new Map<string, number>();
  for (const order of paidOrders) {
    for (const item of order.order_items ?? []) {
      const name = item.meal_name_snapshot?.trim() || item.meals?.name?.trim() || 'Unknown meal';
      mealQuantities.set(name, (mealQuantities.get(name) ?? 0) + item.quantity);
    }
  }

  return {
    range,
    stats: {
      orders: allOrdersInRange.length,
      paidOrders: paidInRange.length,
      paidRevenueCents: paidInRange.reduce((sum, order) => sum + order.total_cents, 0),
      repeatCustomers,
      awaitingFulfillment: fulfillmentResult.count ?? 0,
      unpaidAttention: unpaidResult.count ?? 0,
    },
    trend,
    topMeals: Array.from(mealQuantities.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
      .slice(0, 5),
    customerMix: {
      newCustomers: customerCounts.filter((count) => count === 1).length,
      repeatCustomers,
    },
    recentOrders: recent.map((order) => ({
      id: order.id,
      createdAt: order.created_at,
      customerName: order.customers?.full_name?.trim() || order.customers?.email || 'Customer',
      customerEmail: order.customers?.email ?? 'Email unavailable',
      orderType: order.order_type,
      mealUnits: (order.order_items ?? []).reduce((sum, item) => sum + item.quantity, 0),
      totalCents: order.total_cents,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
    })),
  };
}

function analyticsCustomerKey(order: PaidOrderRow): string {
  if (order.customers?.auth_user_id) return `user:${order.customers.auth_user_id}`;
  const email = order.customers?.email?.trim().toLowerCase();
  return email ? `email:${email}` : `customer:${order.customer_id}`;
}

function buildTrend(orders: TrendOrderRow[], range: DashboardRange, now: Date) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = dateKey(order.created_at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: range }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - (range - index - 1));
    const key = dateKey(date);
    return {
      date: key,
      label: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: BUSINESS_TIME_ZONE,
      }).format(date),
      orders: counts.get(key) ?? 0,
    };
  });
}

function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: BUSINESS_TIME_ZONE,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
