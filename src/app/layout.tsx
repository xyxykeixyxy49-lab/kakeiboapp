import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE構成デザイナー",
  description: "公式LINEのシナリオ・分岐・画面を見える化するツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
