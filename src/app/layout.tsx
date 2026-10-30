import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTPdfStudio | Vector Precision PDF Generator & Design Studio",
  description: "Production-grade pixel-accurate PDF design studio, dynamic schema forms, and deterministic vector PDF engine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden text-neutral-900 bg-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
