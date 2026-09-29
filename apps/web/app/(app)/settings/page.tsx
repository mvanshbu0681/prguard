// /settings has one page today, the policy: the breadcrumb's "Settings" crumb
// lands there instead of on a 404.
import { redirect } from 'next/navigation';

export default function SettingsIndex() {
  redirect('/settings/policy');
}
