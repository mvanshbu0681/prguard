// /repos/:owner has no page of its own (the top bar's breadcrumb links here):
// the account's repositories are the /repos grid.
import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/repos');
}
