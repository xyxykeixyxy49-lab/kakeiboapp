# 戦略MG研修サービス ホームページ プロジェクト

新しく立ち上げる団体（名称未定）の、戦略MG®を活用した研修サービスのホームページ制作プロジェクト。

> ※「戦略MG®」は、株式会社戦略MG研究所の登録商標です。

## 3つの置き場所と役割

| 場所 | 役割 | 置くもの |
|---|---|---|
| **GitHub**（このフォルダ） | ホームページの本体・変更履歴 | HTML/CSS、表記ガイドライン、NGワードチェッカー |
| **Googleドライブ**「戦略MG研修HPプロジェクト」 | 素材・共有資料 | 写真、ロゴ、原稿（Googleドキュメント）、見積・契約書類 |
| **Notion**「戦略MG研修HPプロジェクト」 | 進行管理・議事録 | タスク、決定事項、打合せメモ |

ルール：**決めたことは Notion、作ったものは GitHub / ドライブ**。迷ったら Notion に記録してリンクを貼る。

## フォルダ構成

```
senryaku-mg-hp/
├── README.md               … このファイル
├── docs/
│   ├── brand-guideline.md  … 登録商標・NGワードの表記ルール（必読）
│   └── project-log.md      … 作業ログ
├── site/
│   └── index.html          … トップページ（ドラフト）
└── tools/
    └── check_terms.py      … NGワード・商標表記チェッカー
```

## 表記チェック

```bash
python3 tools/check_terms.py          # site/ を検査
python3 tools/check_terms.py 原稿.md  # 任意のファイルを検査
```

GitHub に push すると `.github/workflows/check-terms.yml` で自動検査される。

## 次にやること

- [ ] 団体名・ロゴの決定
- [ ] 研修メニュー・料金の確定
- [ ] 「戦略会計STRAC」等の要確認事項を戦略MG研究所に確認
- [ ] ドメイン・公開方法（GitHub Pages 等）の決定
- [ ] お問い合わせフォームの設置
