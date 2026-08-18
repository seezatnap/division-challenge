import type { NextConfig } from "next";

/**
 * When reward images are served straight from Cloudflare R2 (R2_PUBLIC_BASE_URL
 * is set), next/image needs that host allow-listed. Read at build time.
 */
function resolveRewardImageRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    return [];
  }

  try {
    const parsedUrl = new URL(publicBaseUrl);
    const protocol = parsedUrl.protocol.replace(/:$/, "");
    if (protocol !== "http" && protocol !== "https") {
      return [];
    }

    const basePathname = parsedUrl.pathname.replace(/\/+$/g, "");
    return [
      {
        protocol,
        hostname: parsedUrl.hostname,
        ...(parsedUrl.port ? { port: parsedUrl.port } : {}),
        pathname: `${basePathname}/**`,
      },
    ];
  } catch {
    console.warn(`[next.config] R2_PUBLIC_BASE_URL is not a valid URL: ${publicBaseUrl}`);
    return [];
  }
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // libsql ships a native binding for `file:` databases; keep it (and the AWS
  // SDK) out of the server bundle so Node loads them normally.
  serverExternalPackages: ["@libsql/client", "libsql", "@aws-sdk/client-s3"],
  images: {
    localPatterns: [
      {
        pathname: "/rewards/**",
      },
      {
        pathname: "/**",
        search: "",
      },
    ],
    remotePatterns: resolveRewardImageRemotePatterns(),
  },
};

export default nextConfig;
