# Auto Color Palette

基準HUEとOKLCHの彩度・明度カーブを指定して、カラーパレットを生成する静的Webアプリです。CSS OKLCH対応ブラウザではCSSで描画し、未対応環境ではJavaScriptへフォールバックします。

## Features

- 基準HUE: 0〜359.9°
- 色相数: 2〜24
- カラーステップ: 5〜30
- OKLCH Cの3点カーブ（縦軸は0〜100%固定）
- OKLCH Lのカスタム3点カーブとS字カーブを切り替え可能（S字も始点・中点・終点をカーブのつまみで設定）
- Grid gap: 0〜40px
- パレット背景色を変更可能
- 色相は360°を均等分割
- グレースケール列を左側に配置
- 基準HUEと共通のC/Lカーブから各スウォッチを生成
- パレットをクリックすると描画色のHEX値をコピー
- 設定値はブラウザのlocalStorageに保存
- sRGB色域外のスウォッチには警告ドットを表示（表示/非表示を設定可能）
- CSS OKLCH未対応環境ではJavaScriptへフォールバック
- システムのライト/ダーク設定に対応

## Run locally

ビルド不要です。ローカルサーバーで配信してください。

~~~sh
python3 -m http.server 4173
~~~

ブラウザでhttp://localhost:4173を開きます。

## Test

```sh
node --test tests/palette-model.test.mjs
```
