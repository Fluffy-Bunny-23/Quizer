import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: '/home/fluffy-bunny-23/coding/Quizer/quiz-app',
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '[::1]',
  ],
};

export default nextConfig;
