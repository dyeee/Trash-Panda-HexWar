// ============================================================
// next.config.js — Next.js 設定（Netlify 最佳化）
// ============================================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Netlify 用 @netlify/plugin-nextjs，不需要 output: 'export'
  // 保持預設 SSR/SSG 混合模式

  // 圖片最佳化
  images: {
    formats: ["image/avif", "image/webp"],
    // 如果只用本地圖片，不需要外部 domain
    unoptimized: false,
  },

  // TypeScript 嚴格模式
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint
  eslint: {
    ignoreDuringBuilds: false,
  },

  // 路徑別名（搭配 tsconfig paths）
  // @/ 已由 tsconfig.json 設定

  // 壓縮
  compress: true,

  // 效能：移除 console.log（production only）
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },
};

module.exports = nextConfig;
