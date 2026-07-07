import Link from 'next/link';

import { TrackPageView } from '@pingaura/telemetry/next';

export default function Pricing() {
  return (
    <main>
      <TrackPageView />
      <h1>Pricing</h1>
      <Link href="/">Home (soft nav)</Link>
    </main>
  );
}
