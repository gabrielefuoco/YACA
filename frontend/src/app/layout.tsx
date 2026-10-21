import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YACA - Yet Another Catalog Addon",
  description: "Configura il tuo addon Stremio personalizzato",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased font-display bg-background text-foreground min-h-dvh">
        <div className="relative flex h-auto min-h-dvh w-full flex-col">
          <div className="layout-container flex h-full grow flex-col">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
