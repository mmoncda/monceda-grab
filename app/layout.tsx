import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://grab.moncedalabs.com"),
  title: "Monceda Grab — Public Media Downloader",
  description: "Save public, authorized social media videos and images with Monceda Grab—a fast, private, and simple tool from Monceda Labs.",
  applicationName: "Monceda Grab",
  authors: [{ name: "Monceda Labs", url: "https://moncedalabs.com" }],
  creator: "Monceda Labs",
  publisher: "Monceda Labs",
  keywords: ["Monceda Grab", "public media downloader", "social media downloader", "Monceda Labs"],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Monceda Grab",
    title: "Monceda Grab — Public Media Downloader",
    description: "Save public media you own or have permission to download—simple, fast, and private.",
    locale: "en_PH",
  },
  twitter: {
    card: "summary",
    title: "Monceda Grab — Public Media Downloader",
    description: "Save public media you own or have permission to download—simple, fast, and private.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {process.env.NEXT_PUBLIC_ADSENSE_CLIENT ? (
          <script
            async
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
          />
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Monceda Grab",
              url: "https://grab.moncedalabs.com/",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Any",
              isAccessibleForFree: true,
              creator: {
                "@type": "Organization",
                name: "Monceda Labs",
                url: "https://moncedalabs.com/",
              },
              description: "A simple tool for saving public media that users own or have permission to download.",
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
