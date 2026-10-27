# 宣傳影片原始檔

兩支影片都是 three.js 動畫＋程式合成配樂，逐格截圖後用 ffmpeg 壓成 1080p。

| 資料夾 | 影片 | 對象 | 識別 |
| --- | --- | --- | --- |
| `v1/` | 補助申請：米特才藝中心 AI 店務升級（45 秒） | 計畫審查、徐立文教 | 米特製造所（奶油底、海軍藍、青綠、黃） |
| `sales/` | EveryThingOS 介紹（43 秒） | 所有實體門店 | 琢奧科技（深藍、青綠、橘），結尾 dropout.tw |

畫面裡的系統截圖都來自 `web/` 練習模式的真實頁面（教育產業包）。補助影片的畫面另外套上米特色系、粉圓字型，公司名顯示「米特才藝中心」，內容與資料不動；兩段解法用完整視窗依三個重點捲動、推近到對應卡片。影片只講已經做好的功能；LINE／IG／FB 要接店家自己的官方帳號與粉專。

## 重做一次

腳本寫死在 `/tmp/promo`，在 `/tmp` 起靜態伺服器（`python3 -m http.server 8765`），並把 three.js 裝在 `/tmp/node_modules/three`、puppeteer-core 裝在 `/tmp/node_modules/puppeteer-core`。

```bash
cp -r promo /tmp/promo && mkdir -p /tmp/promo/assets /tmp/promo/v2
cp branding/assets/logo-hud-lockup-on-dark.png /tmp/promo/assets/do-lockup-dark.png
# 米特製造所橫式 logo（官網），裁掉透明邊後存成 /tmp/promo/assets/meetplus-trim.png
curl -sL "https://static.wixstatic.com/media/f674f3_f7d0e44c96fb489b91b71db9f255acad~mv2.png" -o /tmp/promo/assets/meetplus.png
# 字型：jf open 粉圓（v1）、Noto Sans CJK TC（sales）
cd web && npm run dev -- --port 3456   # 另開一個終端
cd /tmp && node promo/cap2.mjs          # 截系統畫面到 /tmp/promo/v2（sales 用）
# v1 用：同樣的練習帳頁面套米特色系與粉圓字型，截視窗＋整頁長圖到 /tmp/promo/v3，並記下要推近的卡片座標
S='main .glass, main details'
STOCK_FOCUS="{\"a\":{\"sel\":\"$S\",\"text\":\"課程 BOM 與報名材料包\"},\"b\":{\"sel\":\"$S\",\"text\":\"耗用／損耗登記\"},\"c\":{\"sel\":\"$S\",\"text\":\"AI 智慧備料與跨店調撥建議\"}}" \
HR_FOCUS="{\"a\":{\"sel\":\"$S\",\"text\":\"AI 師資媒合與排班建議\"},\"b\":{\"sel\":\"$S\",\"text\":\"近期師資班表與請假代課檢查\"},\"c\":{\"sel\":\"$S\",\"text\":\"主管覆核與異常留痕紀錄\"}}" \
  node promo/cap-meet.mjs
node promo/v1/music.mjs && node promo/render2.mjs v1 all 45
node promo/sales/music.mjs && node promo/render2.mjs sales all 43
ffmpeg -y -framerate 30 -i /tmp/promo/v1/frames/f%04d.jpg -i /tmp/promo/v1/music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -shortest v1.mp4
```

`node promo/render2.mjs v1 2.5 17 43` 只截那幾秒，方便調版面。
