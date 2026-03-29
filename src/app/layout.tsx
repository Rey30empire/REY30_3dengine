import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { DisableNextDevIndicator } from "@/components/dev/DisableNextDevIndicator";

export const metadata: Metadata = {
  title: "REY30 3D Engine Studio",
  description: "Editor AI-first/hibrido para crear escenas, scripts, assets y gameplay en REY30.",
  keywords: ["REY30", "3D Engine", "Game Editor", "TypeScript", "Next.js", "AI-first"],
  authors: [{ name: "REY30 Studio" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "REY30 3D Engine Studio",
    description: "Motor/editor 3D AI-first para crear juegos con flujo manual, hibrido y IA.",
    url: "http://localhost:3000",
    siteName: "REY30",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "REY30 3D Engine Studio",
    description: "Editor 3D AI-first para prototipado y produccion de gameplay.",
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
        className="antialiased bg-background text-foreground"
      >
        <DisableNextDevIndicator />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
