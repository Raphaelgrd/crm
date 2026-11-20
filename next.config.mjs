/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=(self)" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

// La page du siège (/siege/index.html) est affichée dans un cadre par le CRM lui-même :
// elle accepte un cadre de la même origine seulement. Tout le reste reste interdit en cadre.
const siegeHeaders = securityHeaders.map((h) =>
  h.key === "X-Frame-Options"
    ? { key: h.key, value: "SAMEORIGIN" }
    : h.key === "Content-Security-Policy"
      ? { key: h.key, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
      : h,
);

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!siege/|apercu-pptx).*)", headers: securityHeaders },
      { source: "/siege/:path*", headers: siegeHeaders },
      // Lecteur PowerPoint isolé (cadre « bac à sable » de l'aperçu Data Room) : cadre de la même origine seulement.
      { source: "/apercu-pptx", headers: siegeHeaders },
    ];
  },
};

export default nextConfig;
