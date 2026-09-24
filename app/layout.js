import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://gnorate.com"),
  title: "GnoRate",
  description: "Know before your contract renews.",
  openGraph: {
    title: "GnoRate",
    description: "Track every energy contract, read bills automatically, and know whether to renew or switch — before it's too late.",
    url: "https://gnorate.com",
    siteName: "GnoRate",
    locale: "en_IE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "GnoRate",
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
