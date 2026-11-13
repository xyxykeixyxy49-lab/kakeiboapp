import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE構成デザイナー",
  description: "公式LINEのシナリオ・分岐・画面を見える化するツール",
};

// スマホ:画面幅に合わせる。ページ自体の拡大はせず、構成図の中だけ2本指で拡大縮小する
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
