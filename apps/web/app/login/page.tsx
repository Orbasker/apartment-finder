import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { isGoogleConfigured } from "@/lib/auth";
import { env } from "@/lib/env";
import { LocaleSwitcher } from "./locale-switcher";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("Login.metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const t = await getTranslations("Login");
  const sp = await searchParams;
  const urlError = sp.error_description ?? sp.error ?? null;
  const googleEnabled = isGoogleConfigured();
  const oneTapClientId = env().NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      {googleEnabled && oneTapClientId && (
        <GoogleOneTap clientId={oneTapClientId} redirectTo="/matches" />
      )}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Apartment Finder</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm initialError={urlError} googleEnabled={googleEnabled} />
        </CardContent>
      </Card>
      <div className="mt-6">
        <LocaleSwitcher />
      </div>
    </main>
  );
}
