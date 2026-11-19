import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jidout - 24/7 AI agent that finds clients while you sleep",
  description:
    "AI finds high-intent prospects, writes personalized emails, follows up and books meetings - pay as you go.",
  keywords: ["AI outbound", "lead generation", "cold email", "autopilot", "GTM agent"],
  authors: [{ name: "Jidout" }],
  openGraph: {
    title: "Jidout - AI outbound autopilot",
    description: "Get 1 to 3 hot leads in 24 hours free",
    siteName: "Jidout",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
