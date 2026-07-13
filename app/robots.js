export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/invite", "/reset-password"],
    },
    sitemap: "https://wattpryce.com/sitemap.xml",
  };
}
