# Auto Color Palette

input[type="color"]で選んだ色を基準に、CSS Relative Color Syntaxのoklch()を利用してカラーパレットを生成する静的Webアプリです。

## Features

- 色相数: 2〜24
- カラーステップ: 5〜30
- Grid gap: 0〜40px
- パレット背景色を変更可能
- 色相は360°を均等分割
- 明度は選択色のlを基準に、最暗色から最明色まで補間
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
