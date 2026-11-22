import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { SavesProvider } from "@/lib/saves-context";
import { ToastProvider } from "@/components/ui/Toast";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
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
        <ToastProvider>
          <AuthProvider>
            <SavesProvider>
              <Navbar />
              <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">{children}</main>
            </SavesProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
