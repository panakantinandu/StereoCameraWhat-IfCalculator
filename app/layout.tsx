import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stereo Camera What-If Calculator",
  description: "Internal preliminary sizing tool for machine-vision stereo camera setups.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
