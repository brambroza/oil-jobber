export type UUID = string;

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES' | 'ACCOUNTING' | 'OPERATION' | 'OWNER';

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ADMIN_REVIEW'
  | 'CONFIRMED'
  | 'REFINERY_BOOKED'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'PICKUP_READY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface BaseEntity {
  id: UUID;
  company_id: UUID;
  created_at: string;
  updated_at: string;
  created_by: UUID | null;
  updated_by: UUID | null;
  is_deleted: boolean;
}

export interface PaymentCondition extends BaseEntity { code: string; name: string; payment_type: 'CASH' | 'CREDIT'; credit_days: number; extra_cost_per_liter: number; }
export interface Depot extends BaseEntity {
  code: string;
  name: string;
  pickup_cost_per_liter: number;
  refinery_id: UUID | null;
  is_active: boolean;
  refineries?: { id: UUID; name: string } | null;
}
export interface OilProduct extends BaseEntity { code: string; name: string; color_hex: string; is_active: boolean; }
export interface PriceRuleSetting extends BaseEntity { service_fee_per_liter: number; profit_margin_per_liter: number; }

export interface Customer extends BaseEntity {
  company_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  credit_limit: number;
  payment_term_days: number;
  payment_condition_id: UUID | null;
  status: string;
}

export interface UserProfile {
  id: UUID;
  company_id: UUID;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface SaleOrder extends BaseEntity { customer_id: UUID; order_status: OrderStatus; depot_id: UUID | null; payment_condition_id: UUID | null; delivery_location: string | null; refinery_booking_number: string | null; due_date: string | null; }
export interface Invoice extends BaseEntity { sale_order_id: UUID; invoice_no: string; issued_at: string; amount: number; }
