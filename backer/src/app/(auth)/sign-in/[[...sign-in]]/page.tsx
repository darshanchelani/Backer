import { SignIn } from "@clerk/nextjs";
import { SetupNotice } from "@/components/setup-notice";
import { hasClerk } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (!hasClerk) {
    return (
      <SetupNotice
        feature="Authentication"
        steps={[
          "Create a free app at dashboard.clerk.com (30 seconds)",
          "Enable Google as a sign-in option in User & Authentication",
          "Copy the API keys into .env and restart the dev server",
        ]}
        envVars={["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]}
      />
    );
  }
  return <SignIn fallbackRedirectUrl="/dashboard" signUpUrl="/sign-up" />;
}
