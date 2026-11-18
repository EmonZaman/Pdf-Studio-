import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statement Verification",
  description: "City Bank Statement Verification Portal",
  icons: {
    icon: [
      { url: "/images/city-bank-favicon.png", type: "image/png" },
      { url: "/images/city-bank-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/images/city-bank-favicon.png",
    apple: "/images/city-bank-favicon.png",
  },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
