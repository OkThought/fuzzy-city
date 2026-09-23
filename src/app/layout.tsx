import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fuzzy City — One Thousand Evenings",
  description:
    "1,000 people. No scripted evenings. An experiment in probabilistic judgment and ordinary life.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
