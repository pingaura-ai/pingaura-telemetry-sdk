import type { ReactNode } from 'react';

// NOTE: intentionally NO <TrackPageView/> here. The root layout also wraps
// not-found.tsx, so tracking here would re-count 404s.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
