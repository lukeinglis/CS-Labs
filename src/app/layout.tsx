import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Inter rather than the Source Sans used elsewhere: this app is almost entirely stat
// tables, and Inter's tabular figures line up better at small sizes.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CS Labs",
    template: "%s | CS Labs",
  },
  description:
    "Counter-Strike 2 match history, player ratings, and team balancing for our custom games.",
  metadataBase: new URL("https://cs.lukeinglis.me"),
  openGraph: {
    title: "CS Labs",
    description:
      "Counter-Strike 2 match history, player ratings, and team balancing for our custom games.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${oswald.variable} ${inter.variable} flex min-h-screen flex-col antialiased`}
      >
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
