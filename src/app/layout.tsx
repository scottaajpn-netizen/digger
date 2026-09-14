import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Digger — Suis le son", description: "Ton terrain de jeu pour découvrir la musique hors des sentiers battus." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
