import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-12">
      <h1 className="text-3xl font-bold">Apartment Finder</h1>
      <p className="mt-2 text-muted-foreground">
        AI-assisted Tel Aviv apartment finder. Open your dashboard or start chatting.
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/chat"
          className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Chat
        </Link>
      </div>
    </main>
  );
}
