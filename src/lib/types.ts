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
  created_at: string;
  meal_sizes?: MealSize[];
}

export interface MealSize {
  id: string;
  meal_id: string;
  label: string;
  price_cents: number;
  sort_order: number;
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
