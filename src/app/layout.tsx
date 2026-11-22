import type { Metadata } from "next"; import "./globals.css";
export const metadata: Metadata = { title: "Butchery Management System", description: "Stock, sales, carcass processing and financial control for your butchery." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
