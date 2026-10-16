"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

type PostHogClient = typeof import("posthog-js")["default"];

let loader: Promise<PostHogClient> | null = null;

/** Load + init once; both the provider and the identify effect await this. */
function loadPostHog(): Promise<PostHogClient> {
  if (!loader) {
    loader = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(KEY!, {
        api_host: HOST,
        capture_pageview: "history_change",
        capture_pageleave: true,
        person_profiles: "identified_only",
      });
      return posthog;
    });
  }
  return loader;
}

function Identity() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    void loadPostHog().then((posthog) => {
      if (isSignedIn && user) {
        posthog.identify(user.id, {
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName ?? undefined,
        });
      } else {
        posthog.reset();
      }
    });
  }, [isLoaded, isSignedIn, user]);

  return null;
}

/**
 * Wraps the app when NEXT_PUBLIC_POSTHOG_KEY is set; otherwise renders
 * children untouched. `clerkEnabled` is computed server-side so we never
 * call Clerk hooks outside a ClerkProvider.
 */
export function PostHogProvider({
  clerkEnabled,
  children,
}: {
  clerkEnabled: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (KEY) void loadPostHog();
  }, []);

  if (!KEY) return <>{children}</>;

  return (
    <>
      {children}
      {clerkEnabled ? <Identity /> : null}
    </>
  );
}
