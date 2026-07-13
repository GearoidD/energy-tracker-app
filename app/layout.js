import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://wattpryce.com"),
  title: "Wattpryce",
  description: "Know before your contract renews.",
  openGraph: {
    title: "Wattpryce",
    description: "Track every energy contract, read bills automatically, and know whether to renew or switch — before it's too late.",
    url: "https://wattpryce.com",
    siteName: "Wattpryce",
    locale: "en_IE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Wattpryce",
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
