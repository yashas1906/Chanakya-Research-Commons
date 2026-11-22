import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/shell/Header";
import { MemberProvider } from "@/lib/member-context";
import { SavesProvider } from "@/lib/saves-context";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Chanakya Research Commons", template: "%s · Chanakya Research Commons" },
  description:
    "Chanakya University's AI-augmented research discovery, repository and analytics platform.",
};

export const viewport: Viewport = {
  themeColor: "#FAF9F6",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <MemberProvider>
          <SavesProvider>
            <Header />
            <main className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 lg:px-8">{children}</main>
          </SavesProvider>
        </MemberProvider>
      </body>
    </html>
  );
}
