import { notFound } from 'next/navigation';

import { TrackPageView } from '@pingaura/telemetry/next';

// `/blog/missing` calls notFound() BEFORE rendering, so <TrackPageView/> never
// commits: a nested 404 is excluded by construction (page-level placement).
// Any other slug is a real page and is counted.
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === 'missing') notFound();

  return (
    <main>
      <TrackPageView />
      <h1>Blog: {slug}</h1>
    </main>
  );
}
