import type { Metadata, Viewport } from "next";
import { Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { SavesProvider } from "@/lib/saves-context";
import { ToastProvider } from "@/components/ui/Toast";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

const serif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Outfit({
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#121011" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>
            <SavesProvider>
              <AppShell>{children}</AppShell>
            </SavesProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
