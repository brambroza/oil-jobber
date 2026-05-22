import { redirect } from 'next/navigation';

export default function PaymentConditionsLegacyRedirect() {
  redirect('/dashboard/settings/selling-prices');
}
