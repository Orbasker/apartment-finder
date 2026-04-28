export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6 sm:py-6">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">Apartment Finder</span>
          <span>מציאת דירה בתל אביב, בלי לרענן את Yad2 פעם בשעה.</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            <bdi>©</bdi> <bdi>{year}</bdi> Apartment Finder
          </span>
        </div>
      </div>
    </footer>
  );
}
