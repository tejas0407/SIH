import type { Metadata } from "next";
import Providers from "./providers";
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
