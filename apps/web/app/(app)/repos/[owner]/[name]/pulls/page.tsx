// /repos/:owner/:name/pulls (a breadcrumb) is the repository page's PR list.
import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  redirect(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
}
