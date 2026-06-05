export const singleSessionTooltips = {
  totalTokens:
    "セッション全体で使った token の合計。会話、ファイル内容、コマンド結果、Codex の出力などを含む累積の使用量。",
  maxNonCachedInput:
    "セッション中で、新しく処理された入力が最も大きかった値。会話、ファイル内容、コマンド結果などが新しく読み込まれると増える。キャッシュで再利用された分は除く（nonCachedInputTokens）。",
  maxContextUsage: "Codex が一度に見ている情報量の最大割合。1.0 に近いほどコンテキスト枠に近い。",
  compactions: "compaction が発生した回数。長い会話の圧縮がどれくらい挟まったかの目安。",
  events: "イベント数。token 以外の作業密度を見るための補助指標。",
  totalProgress: "totalTokens の推移。",
  contextPressure: "コンテキスト圧の推移。",
  nonCachedPressure: "non-cached input の推移。",
  userMessage: "ユーザー発話のイベント。",
  compaction: "context を圧縮したイベント。",
  largeEvent: "大きいイベントのマーカー。",
  codexStatus: "Codex のステータス更新イベント。",
  tool: "tool 実行イベント。",
  tokenCount: "token_count イベント。",
} as const;

export const overviewTooltips = {
  sessions: "対象に含まれるセッション数。",
  totalTokens: "対象セッションで使った totalTokens の合計。",
  medianSession:
    "1セッションあたりの totalTokens の中央値。極端に大きいセッションに引っ張られにくい代表値。",
  maxEvents: "最も大きい event 数。1セッション内でログに残ったイベント数のピーク。",
  sessionsWithCompaction:
    "compaction が起きたセッション数。長い作業や context が重い作業の多さを見るための目安。",
  nonCachedInput: "新しく処理された入力。inputTokens から cachedInputTokens を引いた値。",
  cachedInput: "キャッシュで再利用された入力。",
  visibleOutput: "通常の出力。outputTokens から reasoningOutputTokens を引いた値。",
  reasoningOutput: "reasoning に使われた出力量。",
  adjustment:
    "reported totalTokens と既知の内訳の差分。内訳だけで totalTokens を完全に説明できないときに表示する。",
  events: "イベント数。totalTokens には直接含まれないが、作業の細かさや長さの手がかりになる。",
  compactions: "compaction が起きた回数。長くなった文脈を圧縮したタイミング。",
} as const;
