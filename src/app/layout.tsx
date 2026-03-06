import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Arc Smart Agent Wallet",
    description: "Modular Wallet for Arc Testnet",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script src="https://telegram.org/js/telegram-web-app.js" async />
            </head>
            <body className={inter.className}>{children}</body>
        </html>
    );
}
