import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://gnorate.ie"),
  title: "GnóRate",
  description: "Know before your contract renews.",
  openGraph: {
    title: "GnóRate",
    description: "Track every energy contract, read bills automatically, and know whether to renew or switch — before it's too late.",
    url: "https://gnorate.ie",
    siteName: "GnóRate",
    locale: "en_IE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "GnóRate",
    description: "Know before your contract renews.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
