import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FiscalYearProvider } from "./contexts/FiscalYearContext";
import { AuthProvider } from "./contexts/AuthContext";  // ← 追加

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ちまたの会計 mini",
  description: "透明性のある会計管理システム",
  applicationName: "ちまたの会計 mini",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ちまたの会計",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.svg', type: 'image/svg+xml' },
    ],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <FiscalYearProvider>
            {children}
          </FiscalYearProvider>
        </AuthProvider>
      </body>
    </html>
  );
}