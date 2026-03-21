import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Manus",
  description: "Artifact-first AI agent prototype powered by AG-UI and A2UI."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
