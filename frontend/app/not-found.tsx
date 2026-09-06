import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl">That record is not here</h1>
      <p className="max-w-md text-sm text-ink-muted">
        The Khata may already have been signed off, or the link may be from a different tehsil
        database.
      </p>
      <Link href="/queue" className="btn mt-2">
        Back to the review queue
      </Link>
    </main>
  );
}
