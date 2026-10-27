# 宣傳影片原始檔

補助影片是 three.js 動畫，介紹影片是 SVG／DOM 動畫，兩支都配程式合成的配樂，逐格截圖後用 ffmpeg 壓成 1080p。

| 資料夾 | 影片 | 對象 | 識別 |
| --- | --- | --- | --- |
| `v1/` | 補助申請：米特才藝中心 AI 店務升級（64 秒，三個卡關點：預約與退改課、材料、師資） | 計畫審查、徐立文教 | 米特製造所（奶油底、海軍藍、青綠、黃） |
| `sales/` | EveryThingOS 介紹（49 秒；六個痛點各一段 3 秒動畫，`sales/pains.js`） | 所有實體門店 | 琢奧科技（白底方格紙、海軍藍字、青綠、橘），後現代拼貼：琢奧的兩個圓環在痛點段被切成碎片散開，揭曉時拼回完整的圓；結尾 dropout.tw |

畫面裡的系統截圖都來自 `web/` 練習模式的真實頁面（教育產業包），截圖時不改任何樣式或文字。補助影片用的是產品裡「設定 → 外觀與店名」存下的設定：外觀選「米特製造所」（奶油底、海軍藍、青綠、jf open 粉圓字），店名填「米特才藝中心」；介紹影片用預設的 EveryThingOS 外觀。兩支影片都先給完整視窗，再推近到對應的卡片。影片只講已經做好的功能；LINE／IG／FB 要接店家自己的官方帳號與粉專。

## 重做一次

腳本寫死在 `/tmp/promo`，在 `/tmp` 起靜態伺服器（`python3 -m http.server 8765`），並把 three.js 裝在 `/tmp/node_modules/three`、puppeteer-core 裝在 `/tmp/node_modules/puppeteer-core`。

```bash
cp -r promo /tmp/promo && mkdir -p /tmp/promo/assets /tmp/promo/v2
python3 -c "from PIL import Image; i=Image.open('branding/assets/logo-full.png'); i.crop(i.getbbox()).save('/tmp/promo/assets/do-full-trim.png')"
# 米特製造所橫式 logo（官網），裁掉透明邊後存成 /tmp/promo/assets/meetplus-trim.png
curl -sL "https://static.wixstatic.com/media/f674f3_f7d0e44c96fb489b91b71db9f255acad~mv2.png" -o /tmp/promo/assets/meetplus.png
# 字型：jf open 粉圓（v1）、Noto Sans CJK TC（sales）
cd web && npm run dev -- --port 3456   # 另開一個終端
cd /tmp && node promo/sales/cap.mjs     # sales 用：預設外觀，每段截一個完整視窗並記下卡片座標到 /tmp/promo/v4
# v1 用：店家設定為「米特製造所」外觀＋店名「米特才藝中心」，截視窗＋整頁長圖到 /tmp/promo/v3，並記下要推近的卡片座標
node promo/cap-meet.mjs   # 要推近的卡片寫在腳本裡（聊天、庫存、人資三頁）
node promo/v1/music.mjs && node promo/render2.mjs v1 all 64
node promo/sales/music.mjs && node promo/render2.mjs sales all 49
ffmpeg -y -framerate 30 -i /tmp/promo/v1/frames/f%04d.jpg -i /tmp/promo/v1/music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -shortest v1.mp4
```

`node promo/render2.mjs v1 2.5 17 43` 只截那幾秒，方便調版面。
