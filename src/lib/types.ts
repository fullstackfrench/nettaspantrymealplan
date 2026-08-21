export interface Meal {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  chef_name: string;
  chef_avatar_url: string | null;
  image_url: string | null;
  price_cents: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ingredients: string[];
  allergen_free: string[];
  tags: string[];
  is_active: boolean;
  is_available_for_one_time: boolean;
  is_available_for_subscription: boolean;
  created_at: string;
  updated_at: string;
  meal_sizes?: MealSize[];
}

export interface MealSize {
  id: string;
  meal_id: string;
  label: string;
  servings: number | null;
  price_cents: number;
  is_active: boolean;
  is_available_for_one_time: boolean;
  is_available_for_subscription: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  blurb: string | null;
  included_credits: number;
  price_cents: number;
  billing_interval: 'day' | 'week' | 'month' | 'year';
  billing_interval_count: number;
  is_active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  current_stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PublicSubscriptionPlan = Pick<
  SubscriptionPlan,
  | 'id'
  | 'code'
  | 'name'
  | 'blurb'
  | 'included_credits'
  | 'price_cents'
  | 'billing_interval'
  | 'billing_interval_count'
>;

export interface Subscription {
  id: string;
  customer_id: string;
  subscription_plan_id: string | null;
  plan_size: number;
  plan_code_snapshot: string | null;
  plan_name_snapshot: string | null;
  included_credits_snapshot: number | null;
  price_cents_snapshot: number | null;
  billing_interval_snapshot: string | null;
  billing_interval_count_snapshot: number | null;
  stripe_price_id: string | null;
  status: string;
  stripe_subscription_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  delivery_notes: string | null;
  containers_out: number;
  deposit_held_cents: number;
  stripe_customer_id: string | null;
  created_at: string;
}

export type OrderStatus =
  | 'pending' | 'paid' | 'packing' | 'out_for_delivery' | 'delivered' | 'canceled';

export type PaymentStatus =
  | 'unpaid' | 'processing' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';

export type FulfillmentStatus =
  | 'unfulfilled' | 'packing' | 'out_for_delivery' | 'delivered' | 'canceled';

export interface Order {
  id: string;
  customer_id: string;
  subscription_id: string | null;
  order_type: 'one_time' | 'subscription';
  status: OrderStatus;
  week_start: string | null;
  delivery_date: string | null;
  subtotal_cents: number;
  deposit_cents: number;
  total_cents: number;
  containers_issued: number;
  containers_returned: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  paid_at: string | null;
  checkout_expires_at: string | null;
  created_at: string;
  customers?: Customer;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  meal_id: string;
  meal_size_id: string | null;
  meal_name_snapshot: string | null;
  size_label_snapshot: string | null;
  servings_snapshot: number | null;
  quantity: number;
  unit_price_cents: number;
  meals?: Meal;
}

export interface WeeklyMenu {
  id: string;
  week_start: string;
  is_published: boolean;
  created_at: string;
}
