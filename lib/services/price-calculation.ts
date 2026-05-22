import { supabaseAdmin } from '@/lib/supabase/server';
import { CalculatePriceInput } from '@/types/dto';

export async function calculateOilSellingPrice(input: CalculatePriceInput): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('calculate_oil_selling_price', {
    p_base: input.baseCostPrice,
    p_payment: input.paymentConditionId,
    p_depot: input.depotId,
    p_company: input.companyId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
