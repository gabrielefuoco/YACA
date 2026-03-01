import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YACA - Yet Another Catalog Addon",
  description: "Configura il tuo addon Stremio personalizzato",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <body className="antialiased min-h-screen bg-[#0f0f13] text-white">
        {/* Background blobs */}
        <div className="fixed top-0 left-0 w-[600px] h-[600px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#8a5aeb]/10 blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 right-0 w-[600px] h-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-blue-600/8 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}

