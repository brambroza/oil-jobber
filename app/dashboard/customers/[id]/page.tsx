import { PageScaffold, SimpleSearchBar } from '@/components/common/PageScaffold';

export default function Page() {
  return <PageScaffold title='หน้าจัดการโมดูล' description='พร้อมต่อยอดเชื่อมข้อมูลจริงจาก Supabase'>
    <SimpleSearchBar />
  </PageScaffold>;
}
