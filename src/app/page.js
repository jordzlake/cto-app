import ApplicationForm from '@/components/ApplicationForm.js';
import { todayYMD } from '@/lib/dates.js';

// Rendered on every request so the date is always today (Trinidad and Tobago time).
export const dynamic = 'force-dynamic';

export default function Home() {
  return <ApplicationForm initialToday={todayYMD()} />;
}
