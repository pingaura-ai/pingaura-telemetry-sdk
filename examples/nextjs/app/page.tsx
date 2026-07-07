import Link from 'next/link';

import { TrackPageView } from '@pingaura/telemetry/next';

export default function Home() {
  return (
    <main>
      <TrackPageView />
      <h1>Home</h1>
      <nav>
        <Link href="/pricing">Pricing (soft nav)</Link> ·{' '}
        <Link href="/blog/hello">Blog: hello</Link> ·{' '}
        <Link href="/blog/missing">Blog: missing (404)</Link>
      </nav>
    </main>
  );
}
