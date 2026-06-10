# Release Guide

Chrome Web Store公開に向けたリリース手順です。

## 1. 事前確認

- `manifest.json` の `version` がリリース予定バージョンになっている
- README、PRIVACY、SECURITY、LICENSEが最新になっている
- Chromeでパッケージ化されていない拡張機能として読み込み、note記事ページで動作確認済み
- 不要な開発ファイルや一時ファイルが含まれていない

## 2. 最小検証

```powershell
node --check content.js
Get-Content -Encoding UTF8 manifest.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

## 3. パッケージ作成

Chrome Web Storeにアップロードするzipには、拡張機能に必要なファイルだけを含めます。

PowerShell例:

```powershell
$version = (Get-Content -Encoding UTF8 manifest.json -Raw | ConvertFrom-Json).version
$package = "note-markdown-copier-$version.zip"
Compress-Archive -Path manifest.json, content.js, styles.css, LICENSE, README.md, PRIVACY.md -DestinationPath $package -Force
```

含めるファイル:

- `manifest.json`
- `content.js`
- `styles.css`
- `LICENSE`
- `README.md`
- `PRIVACY.md`

含めないもの:

- `.git/`
- `.github/`
- 一時ファイル
- ローカル検証用ファイル

## 4. Chrome Web Store提出

ストア提出前に、次の説明を準備します。

- 拡張機能名
- 短い説明
- 詳細説明
- スクリーンショット
- サムネイル画像: `assets/store/note-markdown-copy-thumbnail.jpg`
- アイキャッチ画像: `assets/store/note-markdown-copy-eyecatch.jpg`
- プライバシー説明
- サポートURLまたはGitHubリポジトリURL

## 5. リリース後

- GitHub Releaseを作成する
- リリースノートに変更点と検証内容を書く
- READMEの公開状況を更新する
