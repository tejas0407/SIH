import type { Metadata } from "next";
import Providers from "./providers";
import AuthGate from "@/components/AuthGate";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Land record reviewer · DILRMP",
  description:
    "Digitises legacy Records of Rights, checks the arithmetic every register must satisfy, and routes the rest to a reviewer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthGate>{children}</AuthGate>
        </Providers>
      </body>
    </html>
  );
}
