/**
 * Pure helpers for the customer list: linked LINE accounts and credit usage.
 */

export type CustomerLineAccount = {
  id: string;
  display_name: string | null;
  profile_image_url: string | null;
  is_group: boolean;
};

type LineCustomerRow = {
  id: string;
  customer_id: string | null;
  group_id: string | null;
  display_name: string | null;
  profile_image_url: string | null;
};

export type CreditUsage = {
  remaining: number;
  percentUsed: number;
};

/**
 * Groups linked LINE rows by customer. A LINE group may have one row per
 * member who wrote in it, so each group appears once per customer.
 *
 * @param rows - `line_customers` rows, most recently updated first
 * @returns customer id → accounts; never exposes LINE user or group ids
 */
export function groupLineAccountsByCustomer(rows: LineCustomerRow[]): Map<string, CustomerLineAccount[]> {
  const accounts = new Map<string, CustomerLineAccount[]>();
  const seenGroups = new Set<string>();

  for (const row of rows) {
    if (!row.customer_id) continue;
    if (row.group_id) {
      const groupKey = `${row.customer_id}:${row.group_id}`;
      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);
    }
    const list = accounts.get(row.customer_id) ?? [];
    list.push({
      id: row.id,
      display_name: row.display_name,
      profile_image_url: row.profile_image_url,
      is_group: Boolean(row.group_id),
    });
    accounts.set(row.customer_id, list);
  }
  return accounts;
}

/**
 * Computes the remaining credit and how much of the limit is used.
 *
 * @param creditLimit - customer's credit limit
 * @param outstanding - total unpaid amount
 * @returns remaining credit (negative when over limit) and usage capped to 0-100
 */
export function calculateCreditUsage(creditLimit: number, outstanding: number): CreditUsage {
  const limit = Number(creditLimit || 0);
  const owed = Number(outstanding || 0);
  const percentUsed = limit > 0 ? Math.min(100, Math.max(0, (owed / limit) * 100)) : owed > 0 ? 100 : 0;
  return { remaining: limit - owed, percentUsed };
}
