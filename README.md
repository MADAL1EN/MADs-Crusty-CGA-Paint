# MADs Crusty Paint

320 by 200 indexed canvas, CGA-style 4-color framebuffer, Vite + TypeScript.

## Layout

- `src/paint/PaintEngine.ts` - document state, tools, undo, compositing (no DOM).
- `src/rendering/CanvasPresenter.ts` - scales the framebuffer to the display canvas.
- `src/app/mountPaintApp.ts` - DOM shell and wiring.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm test
```

## GitHub Pages

The workflow `.github/workflows/pages.yml` builds with `npm run build` and deploys the `dist` folder when you push to `main`.

### One-time repository setup

1. On GitHub: **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions** (not "Deploy from a branch").
2. Set Vite's `base` in `vite.config.ts` so it matches how the site is served:
   - **User or organization site** (`https://YOURNAME.github.io/`): keep `base: '/'`.
   - **Project site** (`https://YOURNAME.github.io/REPO_NAME/`): set `base: '/REPO_NAME/'` (leading and trailing slashes).
3. Push to `main`. Check **Actions** for the "Deploy GitHub Pages" run; when it succeeds, open the site URL from the job or **Settings → Pages**.

Local check before pushing: `npm run build && npm run preview` (preview respects `base`).

### If assets 404 on Pages

Almost always a `base` mismatch: the `base` path must exactly match the repo segment in the URL (for project pages).

## Tools

Pencil, brush, eraser, line, bucket, colour picker, rectangle select, lasso. Patterns apply when tool size is greater than 1. Enter merges a floating selection; Escape cancels it.

## Palette

Index 0 is paper (16 EGA background choices). Indices 1-3 are the active CGA set (set 0 or set 1).
