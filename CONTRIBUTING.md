# Contributing

note記事Markdownコピーへのコントリビューションを歓迎します。

## 歓迎する貢献

- noteのDOM変更への追従
- Markdown変換の改善
- 本文外要素の除外精度向上
- READMEや公開手順の改善
- Chrome Web Store公開に向けたチェック項目の改善

大きな仕様変更や権限追加を含む変更は、先にIssueで相談してください。

## 開発の流れ

1. Issueがある場合は、関連Issueを確認します。
2. ブランチを作成します。
3. 変更を加えます。
4. 最小検証を実行します。
5. Pull Requestを作成します。

## 最小検証

```powershell
node --check content.js
Get-Content -Encoding UTF8 manifest.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

可能であれば、Chromeでパッケージ化されていない拡張機能として読み込み、note記事ページでコピー結果も確認してください。

## Pull Requestの期待事項

- 変更内容と理由が説明されていること
- どの検証を行ったかが書かれていること
- ユーザーのプライバシーや権限に影響する場合、その影響が説明されていること
- 関係ないリファクタリングを含めないこと

## Code of Conduct

このプロジェクトに参加する人は [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) に従ってください。
