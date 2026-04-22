import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "./footer";

export const metadata = {
  title: "Apartment Finder",
  description: "AI-assisted Tel Aviv apartment finder",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
