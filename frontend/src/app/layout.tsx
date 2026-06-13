import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreatorOS",
  description: "A personal workspace for planning and producing creator projects.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
