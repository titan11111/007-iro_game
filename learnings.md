# 007-iro_game learnings

## 2026-07-24 — OKLCH混色 / Popover / View Transitions / iOS UI

- RGB平均の混色は絵具世界観を損なう。黄×青がグレー寄りになる → OKLCH補間＋彩度0.9で絵具の濁りを再現すると直感に合う（検証: 黄×ウルトラマリン → 緑系）
- iPhone主戦場では drag&drop よりタップ選択が必須。スロット文言も「ドロップ」からタップ導線に変更
- `alert()` は世界観を割る。Popover API のボトムシート（命名の儀・図鑑詳細）に置き換え。未対応ブラウザは fixed フォールバック
- View Transitions は混色結果・図鑑登録に使うと儀式感が出る。未対応は即時更新でフォールバック
- BGM `madobe.mp3` 5.0MB（ジャケット画像付き）は3MB鉄則違反。`-vn` で音声のみ AAC 64k mono → `madobe.m4a` 0.89MB。合計プレイ時 ~0.90MB
- 図鑑系UIは縦スクロールが本体なので `overflow:hidden` 全面適用は不可。`touch-action: pan-y` + ダブルタップ防止 + 入力欄のみ `user-select: text` が現実解
- iOS: TAP TO START で BGM+WebAudio unlock。`pointerdown`+`click` 両方。復帰時 `visibilitychange` で AudioContext resume。パレット/図鑑グリッドは `touch-action:none`
- iOS単画面は「ページ全体スクロール禁止 + パレット/図鑑タブ切替 + パネルだけ必要時スクロール」が現実解。ネストカードをやめてフラットにすると視認性が上がる
- パレットは基本12色固定。図鑑はスタート時常に0（永続化しない）。混色・命名でセッション中のみ増える
- 命名UIは自前の中央モーダル（Popover APIはiOSで崩れるため不使用）。色丸＋親色名＋全幅入力＋やめる/授ける
- CSSで `.kobito-idle {` の閉じ括弧欠落があると、以降の `.modal-overlay` など全ルールが無効化され命名カードが出ない（2026-07-24）
- 図鑑カードは二重枠をやめて色面フルサイズ＋名前オーバーレイ。詳細は長押し。妖精の移動スペースを最大化
