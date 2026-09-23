// OWNER: d1 (wave 3). Stub from T0 — replace entirely.
// Next 16: `params` is a Promise and must be awaited.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section data-stub data-route="/runs/[id]" className="px-4 py-12 md:px-8">
      <p className="type-label text-text-dim">/runs/{id}</p>
    </section>
  );
}
