export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">Apartment Finder</span>
          <span>AI-assisted Tel Aviv apartment finder.</span>
        </div>
        <div className="flex items-center gap-4">
          <span>&copy; {year} Apartment Finder</span>
        </div>
      </div>
    </footer>
  );
}
