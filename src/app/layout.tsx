import type { Metadata } from "next";
import { Lora, Montserrat, Lato } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The African Nexus Quarterly",
    template: "%s | The African Nexus Quarterly"
  },
  description: "An interdisciplinary, peer-reviewed international academic journal focusing on political, economic, environmental, and human development issues in Africa.",
  keywords: ["academic journal", "African studies", "multidisciplinary research", "peer-reviewed", "open access"],
  authors: [{ name: "Okul Yöneticileri Derneği" }],
  creator: "Okul Yöneticileri Derneği",
  publisher: "Okul Yöneticileri Derneği",
  metadataBase: new URL("http://localhost:3000"),
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lora.variable} ${montserrat.variable} ${lato.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg-page text-text-primary">
        <Header />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
