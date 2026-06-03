import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Odds Analytics | Command Center de Inteligência Esportiva",
  description: "Plataforma preditiva de apostas baseada em modelos estatísticos de Poisson e Critério de Kelly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
