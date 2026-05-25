import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }
  return browserClient;
}
