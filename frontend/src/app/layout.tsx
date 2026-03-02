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
      <body className="antialiased min-h-screen bg-[#0a0a0f] text-white">
        {/* Background blobs */}
        <div className="fixed top-0 left-0 w-[700px] h-[700px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#8a5aeb]/8 blur-[120px] pointer-events-none" />
        <div className="fixed bottom-0 right-0 w-[700px] h-[700px] translate-x-1/3 translate-y-1/3 rounded-full bg-blue-600/6 blur-[120px] pointer-events-none" />
        <div className="fixed top-1/2 left-1/2 w-[400px] h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8a5aeb]/4 blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}

