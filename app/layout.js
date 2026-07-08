import "./globals.css";

export const metadata = {
  title: "Wattpryce",
  description: "Know before your contract renews.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
