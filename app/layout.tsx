import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./app-shell.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Fonia Projects | Collaborative project management",
    template: "%s | Fonia Projects"
  },
  description:
    "Fonia Projects is the collaborative project management tool from Fonia Labs: group projects, task assignment, task-level discussion, and a board that updates in real time.",
  keywords: [
    "Fonia Projects",
    "project management",
    "kanban board",
    "task management",
    "team collaboration",
    "Fonia Labs",
    "FonTech"
  ],
  authors: [{ name: "Ifidon Abraham" }],
  creator: "Ifidon Abraham",
  applicationName: "Fonia Projects",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "Fonia Projects",
    title: "Fonia Projects — plan, assign, and ship together",
    description:
      "Group projects, task assignment, task-level discussion, and a realtime board. A Fonia Labs Product.",
    images: ["/badges/a-fonia-labs-product.svg"]
  },
  twitter: {
    card: "summary_large_image",
    creator: "@ifidonabraham",
    description: "Collaborative project management. A Fonia Labs Product."
  }
};

export const viewport: Viewport = {
  themeColor: "#0b1120",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Same typography as the Fonia Labs design system. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}