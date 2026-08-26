# Auto Color Palette

input[type="color"]で選んだ色を基準に、CSS Relative Color Syntaxのoklch()を利用してカラーパレットを生成する静的Webアプリです。

## Features

- 色相数: 2〜24
- カラーステップ: 5〜30
- Grid gap: 0〜40px
- パレット背景色を変更可能
- 最暗色・最明色のOKLCH l: 0〜1
- 色相は360°を均等分割
- HUE 0°の左側にグレースケールを配置
- 選択色の色相・彩度を基準に、設定した最暗色lから最明色lまで補間
- パレットをクリックすると描画色のHEX値をコピー
- 設定値はブラウザのlocalStorageに保存
- CSS Relative Color Syntax未対応環境ではJavaScriptへフォールバック
- システムのライト/ダーク設定に対応

## Run locally

ビルド不要です。ローカルサーバーで配信してください。

~~~sh
python3 -m http.server 4173
~~~

ブラウザでhttp://localhost:4173を開きます。
