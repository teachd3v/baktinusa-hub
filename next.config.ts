import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Tautan dari app survey lama: /survey/<kode-referal>
    return [{ source: "/survey/:kode", destination: "/s/:kode", permanent: true }];
  },
};

export default nextConfig;
