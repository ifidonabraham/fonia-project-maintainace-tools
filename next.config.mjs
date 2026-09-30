/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Prisma is a native/Node-only dependency. Keeping it external stops Next from
  // trying to bundle its engine binaries into the server build.
  serverExternalPackages: ["@prisma/client"],

  // Allow Next <Image> to serve avatars from Cloudinary.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**"
      }
    ]
  },

  async redirects() {
    return [
      // Short alias — /board/:id is the friendly way to share a project board.
      { source: "/board/:id", destination: "/projects/:id", permanent: false }
    ];
  }
};

export default nextConfig;