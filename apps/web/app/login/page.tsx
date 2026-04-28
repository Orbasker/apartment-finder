import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "כניסה — Apartment Finder",
  description: "כניסה לחיפוש דירה בתל אביב.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const sp = await searchParams;
  const urlError = sp.error_description ?? sp.error ?? null;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Apartment Finder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          התראות מיידיות על דירות חדשות בתל אביב, לפי הסינונים שלך.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>כניסה</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm initialError={urlError} />
        </CardContent>
      </Card>
    </main>
  );
}
