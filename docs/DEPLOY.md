# 🚀 HexWar — Netlify 部署指南

## 前置需求

- [Node.js 20+](https://nodejs.org/)
- [Git](https://git-scm.com/)
- [GitHub 帳號](https://github.com/)
- [Netlify 帳號](https://netlify.com/)（可用 GitHub 登入，免費）

---

## Step 1：本機確認可以建置

```bash
# 安裝依賴
npm ci

# 型別檢查
npm run type-check

# 試建置（確認沒有錯誤）
npm run build
```

建置成功會看到 `.next/` 資料夾。

---

## Step 2：推上 GitHub

```bash
# 初始化 Git（如果還沒做）
git init
git add .
git commit -m "init: hexwar project"

# 建立 GitHub repo 後推上去
git remote add origin https://github.com/你的帳號/hexwar.git
git branch -M main
git push -u origin main
```

---

## Step 3：連接 Netlify

1. 前往 [app.netlify.com](https://app.netlify.com)
2. 點 **「Add new site」→「Import an existing project」**
3. 選 **GitHub**，授權後找到 `hexwar` repo
4. 設定如下：

| 欄位 | 值 |
|------|-----|
| Branch to deploy | `main` |
| Build command | `npm ci && npm run build` |
| Publish directory | `.next` |

5. 點 **「Deploy site」**

> ✅ `netlify.toml` 已經設定好，Netlify 會自動讀取，不需要手動填。

---

## Step 4：確認 Plugin 安裝

Netlify 會自動偵測 `netlify.toml` 裡的：

```toml
[[plugins]]
  package = "@netlify/plugin-nextjs"
```

如果 Dashboard 出現「Plugin not installed」提示，到：
**Site settings → Plugins → 搜尋 `@netlify/plugin-nextjs` → Install**

---

## Step 5：完成！

部署完成後你會得到：

```
https://hexwar-xxxxx.netlify.app
```

可以在 **Site settings → Domain management** 設定自訂網域。

---

## 之後每次更新

```bash
git add .
git commit -m "feat: 新功能描述"
git push
```

推上 GitHub 後 Netlify 會**自動重新部署**，約 1~2 分鐘完成。

---

## 常見錯誤排解

### ❌ Build failed: Cannot find module '@/...'
確認 `tsconfig.json` 有設定 paths：
```json
"paths": { "@/*": ["./src/*"] }
```

### ❌ Error: `localStorage` is not defined
Next.js SSR 環境沒有 `localStorage`，要改成：
```typescript
// 在 useEffect 或 typeof window !== 'undefined' 判斷後才呼叫
useEffect(() => {
  const data = localStorage.getItem("hexwar:profiles");
}, []);
```

### ❌ 404 on page refresh
`netlify.toml` 已設定 SPA fallback：
```toml
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```
確認這段存在即可。

### ❌ Plugin version mismatch
```bash
npm install @netlify/plugin-nextjs@latest --save-dev
```

---

## 資料夾結構確認清單

部署前確認以下檔案存在：

```
✅ netlify.toml
✅ next.config.js
✅ tsconfig.json
✅ package.json
✅ .gitignore
✅ src/app/layout.tsx      （Next.js App Router 必要）
✅ src/app/page.tsx        （首頁）
```
