# 📐 HexWar — 完整架構文件

## 技術棧
```
前端：Next.js 14 (App Router) + TypeScript
動畫：Canvas API
後端：Supabase（Auth + PostgreSQL）
部署：Netlify + @netlify/plugin-nextjs
```

## 目錄結構

```
hexwar/
├── netlify.toml                  ✅ Netlify 部署設定
├── package.json                  ✅ 依賴清單
├── .env.example                  ✅ 環境變數範本
├── supabase/
│   └── schema.sql                ✅ 資料庫建表 SQL
└── src/
    ├── types/
    │   ├── index.ts              ✅ 遊戲型別
    │   └── player.ts             ✅ 玩家/紀錄型別
    ├── constants/index.ts        ✅ 遊戲常數
    ├── hooks/
    │   ├── useGame.ts            ✅ 遊戲狀態
    │   ├── usePlayer.ts          ✅ 本地玩家紀錄
    │   └── useAuth.ts            ✅ 帳號認證狀態
    ├── lib/
    │   ├── utils/hex.ts          ✅ 六角格數學
    │   ├── game/                 ✅ 遊戲邏輯
    │   ├── storage/store.ts      ✅ localStorage + JSON 匯出
    │   ├── auth/authService.ts   ✅ 註冊/登入/登出
    │   └── supabase/
    │       ├── client.ts         ✅ Supabase 客戶端 + 型別
    │       └── api.ts            ✅ 對戰紀錄/排行榜 API
    └── components/
        ├── auth/AuthForm.tsx     ✅ 登入/註冊表單
        ├── game/
        │   ├── PlayerSetup.tsx   ✅ 玩家設定畫面
        │   └── Leaderboard.tsx   ✅ 排行榜/紀錄
        └── canvas/HexCanvas.tsx  ⬜ 待建立
```

## Supabase 資料流

```
註冊
  → supabase.auth.signUp() + metadata
  → DB trigger → 自動建立 profiles 列
  → join_leaderboard 同步儲存

遊戲結束
  → uploadMatch() → matches 表
  → leaderboard VIEW 自動重算

排行榜
  → fetchLeaderboard() → leaderboard VIEW
  → 只顯示 join_leaderboard = true 的玩家
```

## Netlify 部署步驟

```
1. 推送到 GitHub
2. Netlify > New Site > Import from GitHub
3. Build:   npm run build
4. Publish: .next
5. 環境變數（Netlify Dashboard > Environment Variables）:
     NEXT_PUBLIC_SUPABASE_URL=...
     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
6. Deploy！
```

## 排行榜隱私設計

| join_leaderboard | 效果 |
|-----------------|------|
| true  | 出現在全球排行榜，所有人可見 |
| false | 排行榜隱藏，本地紀錄仍保存 |
| 可隨時切換 | `updateLeaderboardOpt()` |
