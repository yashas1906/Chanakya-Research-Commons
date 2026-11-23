import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { SavesProvider } from "@/lib/saves-context";
import { ToastProvider } from "@/components/ui/Toast";

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
  themeColor: "#3449CC",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
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
