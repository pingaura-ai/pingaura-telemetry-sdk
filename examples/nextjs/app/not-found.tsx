// Root not-found. Intentionally NO <TrackPageView/>: a request that renders this
// (a scanner probe like /wp-login.php, or a nested notFound()) must not count.
export default function NotFound() {
  return (
    <main>
      <h1>404 Not Found</h1>
    </main>
  );
}
