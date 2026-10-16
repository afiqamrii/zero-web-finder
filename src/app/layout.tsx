import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "Zero Web Finder — Your growth workspace",
  description: "Discover leads, automate approved outreach, and track projects in one private workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
