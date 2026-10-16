import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Backer - Stop writing investor updates by hand",
    template: "%s · Backer",
  },
  description:
    "Backer drafts your monthly investor email from your Stripe, HubSpot, and Mixpanel data - in your voice, in 60 seconds. Send from your own address. Know exactly who read it.",
};

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const inner = (
    <PostHogProvider clerkEnabled={hasClerk}>
      <TooltipProvider>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </TooltipProvider>
    </PostHogProvider>
  );

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Clerk Core 3: ClerkProvider must be inside <body>, not wrapping <html> */}
        {hasClerk ? <ClerkProvider>{inner}</ClerkProvider> : inner}
      </body>
    </html>
  );
}
