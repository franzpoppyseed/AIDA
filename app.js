(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DATA = window.AIDA_DATA || {};
  const CONTEXT = DATA.contextExamples || {};
  const STORAGE_KEY = "aida.functional.v3.state";
  const DAY = 86_400_000;

  const source = {
    jpG: DATA.japaneseGrammar?.items || [],
    jpV: DATA.japaneseVocabulary?.items || [],
    yueG: DATA.cantoneseGrammar?.items || [],
    yueV: DATA.cantoneseVocabulary?.items || [],
    jpS: DATA.comprehension?.japanese?.sentences || [],
    jpP: [...(DATA.comprehension?.japanese?.passages || []), ...(DATA.readingPassages?.japanese || [])],
    yueS: DATA.comprehension?.cantonese?.sentences || [],
    yueP: [...(DATA.comprehension?.cantonese?.passages || []), ...(DATA.readingPassages?.cantonese || [])]
  };

  const byId = new Map();
  Object.entries(source).forEach(([kind, items]) => {
    items.forEach(item => byId.set(`${kind}:${item.id}`, { kind, item }));
  });

  const JP_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const YUE_LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const YUE_VOCAB_LIMITS = { Beginner: 3000, Intermediate: 12000, Advanced: Infinity };
  const XP_AWARDS = { 1: 2, 2: 5, 4: 9, 5: 12 };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const normalize = value => String(value ?? "").normalize("NFKC").toLocaleLowerCase();
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
  const titleCase = value => String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());


  function jyutpingSyllables(reading) {
    return String(reading || "")
      .normalize("NFKC")
      .match(/[A-Za-z]+[0-9]/g) || [];
  }

  function cantoneseRubyHtml(text, reading) {
    const syllables = jyutpingSyllables(reading);
    if (!syllables.length) return escapeHtml(text);
    let syllableIndex = 0;
    return [...String(text || "")].map(char => {
      if (/\p{Script=Han}/u.test(char)) {
        const syllable = syllables[syllableIndex++] || "";
        return syllable
          ? `<ruby><rb>${escapeHtml(char)}</rb><rt>${escapeHtml(syllable)}</rt></ruby>`
          : escapeHtml(char);
      }
      return escapeHtml(char);
    }).join("");
  }

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function defaultState() {
    return {
      version: 5,
      profile: {
        name: "Learner",
        jpTarget: "N5",
        yueTarget: "Beginner",
        jpDailyGoal: 30,
        yueDailyGoal: 30
      },
      xp: { jp: 0, yue: 0 },
      activity: { jp: {}, yue: {} },
      srs: {},
      sessions: { jp: 0, yue: 0 },
      answers: {
        jp: { correct: 0, wrong: 0 },
        yue: { correct: 0, wrong: 0 }
      },
      lastSession: null,
      preferredStudyLanguage: "jp",
      audio: { jpVoiceId: "", yueVoiceId: "" }
    };
  }

  function migrateState(raw) {
    const fresh = defaultState();
    if (!raw || typeof raw !== "object") return fresh;

    if (raw.version === 5 || raw.version === 4) {
      return {
        ...fresh,
        ...raw,
        profile: { ...fresh.profile, ...(raw.profile || {}) },
        xp: { ...fresh.xp, ...(raw.xp || {}) },
        activity: {
          jp: { ...(raw.activity?.jp || {}) },
          yue: { ...(raw.activity?.yue || {}) }
        },
        sessions: { ...fresh.sessions, ...(raw.sessions || {}) },
        answers: {
          jp: { ...fresh.answers.jp, ...(raw.answers?.jp || {}) },
          yue: { ...fresh.answers.yue, ...(raw.answers?.yue || {}) }
        },
        audio: { ...fresh.audio, ...(raw.audio || {}) },
        version: 5
      };
    }

    // Version 3 used paired Japanese/Cantonese sessions, one shared XP total,
    // and one combined activity log. Split those historical totals evenly.
    const oldXp = Number(raw.xp) || 0;
    const oldGoal = Math.max(30, Number(raw.profile?.dailyGoal) || 30);
    const splitActivity = { jp: {}, yue: {} };
    Object.entries(raw.activity || {}).forEach(([date, value]) => {
      const count = Number(value) || 0;
      splitActivity.jp[date] = Math.ceil(count / 2);
      splitActivity.yue[date] = Math.floor(count / 2);
    });

    return {
      ...fresh,
      profile: {
        ...fresh.profile,
        name: raw.profile?.name || "Learner",
        jpTarget: JP_LEVELS.includes(raw.profile?.jpTarget) ? raw.profile.jpTarget : "N5",
        yueTarget: "Beginner",
        jpDailyGoal: oldGoal,
        yueDailyGoal: oldGoal
      },
      xp: { jp: Math.ceil(oldXp / 2), yue: Math.floor(oldXp / 2) },
      activity: splitActivity,
      srs: raw.srs || {},
      sessions: {
        jp: Number(raw.sessions) || 0,
        yue: Number(raw.sessions) || 0
      },
      answers: {
        jp: {
          correct: Math.ceil((Number(raw.answers?.correct) || 0) / 2),
          wrong: Math.ceil((Number(raw.answers?.wrong) || 0) / 2)
        },
        yue: {
          correct: Math.floor((Number(raw.answers?.correct) || 0) / 2),
          wrong: Math.floor((Number(raw.answers?.wrong) || 0) / 2)
        }
      }
    };
  }

  function loadState() {
    try {
      return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderDashboard();
  }

  function langFromKind(kind) {
    return kind.startsWith("jp") ? "jp" : "yue";
  }

  function languageName(lang) {
    return lang === "jp" ? "Japanese" : "Cantonese";
  }

  function itemKey(kind, item) {
    return `${kind}:${item.id}`;
  }

  function sourceEntryFor(entry) {
    if (!entry?.item?._sourceKind || !entry.item._sourceId) return entry;
    return byId.get(`${entry.item._sourceKind}:${entry.item._sourceId}`) || entry;
  }

  function baseItemKey(entry) {
    const base = sourceEntryFor(entry);
    return itemKey(base.kind, base.item);
  }

  function scheduleEntry(entry, rating) {
    const base = sourceEntryFor(entry);
    return schedule(base.kind, base.item, rating);
  }

  function srsFor(key) {
    return state.srs[key] || {
      ease: 2.5,
      interval: 0,
      reps: 0,
      due: Date.now(),
      seen: 0,
      correct: 0,
      wrong: 0,
      mastery: 0,
      last: 0,
      lastRating: null
    };
  }

  function markActivity(lang, points = 1) {
    const key = todayKey();
    state.activity[lang][key] = (state.activity[lang][key] || 0) + points;
  }

  function schedule(kind, item, rating) {
    const key = itemKey(kind, item);
    const srs = { ...srsFor(key) };
    const lang = langFromKind(kind);

    srs.seen += 1;
    srs.last = Date.now();
    srs.lastRating = rating;

    if (rating <= 1) {
      srs.reps = 0;
      srs.interval = 0.007;
      srs.ease = Math.max(1.3, srs.ease - 0.2);
      srs.wrong += 1;
    } else if (rating === 2) {
      srs.reps += 1;
      srs.interval = srs.reps <= 1 ? 0.5 : Math.max(1, srs.interval * 1.2);
      srs.ease = Math.max(1.3, srs.ease - 0.08);
      srs.correct += 1;
    } else if (rating === 4) {
      srs.reps += 1;
      srs.interval = srs.reps === 1 ? 1 : srs.reps === 2 ? 3 : Math.max(3, srs.interval * srs.ease);
      srs.ease += 0.02;
      srs.correct += 1;
    } else {
      srs.reps += 1;
      srs.interval = srs.reps === 1 ? 3 : srs.reps === 2 ? 7 : Math.max(7, srs.interval * srs.ease * 1.35);
      srs.ease += 0.08;
      srs.correct += 1;
    }

    srs.mastery = clamp(
      Math.round((srs.reps * 12) + (srs.ease - 1.3) * 22 - Math.min(30, srs.wrong * 4)),
      0,
      100
    );
    srs.due = Date.now() + srs.interval * DAY;

    state.srs[key] = srs;
    state.xp[lang] += XP_AWARDS[rating] || 0;
    markActivity(lang, 1);
    return srs;
  }

  function learnedEntries(lang = "all") {
    return Object.entries(state.srs)
      .map(([key, srs]) => ({ key, srs, ...(byId.get(key) || {}) }))
      .filter(entry => entry.item && (lang === "all" || langFromKind(entry.kind) === lang));
  }

  function dueEntries(lang = "all") {
    const now = Date.now();
    return learnedEntries(lang)
      .filter(entry => entry.srs.due <= now)
      .sort((a, b) => a.srs.due - b.srs.due);
  }

  function languageMastery(lang) {
    const entries = learnedEntries(lang);
    if (!entries.length) return 0;
    return Math.round(entries.reduce((sum, entry) => sum + (entry.srs.mastery || 0), 0) / entries.length);
  }

  function streak() {
    let count = 0;
    let date = new Date();
    while (true) {
      const key = todayKey(date);
      const total = (state.activity.jp[key] || 0) + (state.activity.yue[key] || 0);
      if (!total) break;
      count += 1;
      date = new Date(date.getTime() - DAY);
    }
    return count;
  }

  function weekData() {
    const rows = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * DAY);
      const key = todayKey(date);
      rows.push({
        key,
        label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
        jp: state.activity.jp[key] || 0,
        yue: state.activity.yue[key] || 0
      });
    }
    return rows;
  }

  let toastTimer;
  const toast = $("#toast");
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function showDialog(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
  function closeDialog(dialog) { if (dialog?.open) dialog.close(); }

  // ---------- learner-friendly display ----------

  const PLACEHOLDER_LABELS = {
    SUBJECT: "subject",
    OBJECT: "object",
    PERSON: "person",
    PLACE: "place",
    NOUN: "noun",
    N: "noun",
    VERB: "verb",
    V: "verb",
    ADJ: "adjective",
    ADV: "adverb",
    CLAUSE: "clause",
    PHRASE: "phrase",
    NUMBER: "number",
    TIME: "time",
    HOUR: "hour",
    MINUTES: "minutes",
    CLASSIFIER: "classifier",
    CL: "classifier",
    PRONOUN: "pronoun",
    REQUEST: "request",
    TOPIC: "topic",
    COMMENT: "comment",
    PREDICATE: "predicate",
    MODIFIER: "modifier",
    "DIRECT OBJECT": "direct object",
    "INDIRECT OBJECT": "indirect object",
    DO: "direct object",
    IO: "indirect object",
    S: "subject",
    O: "object",
    X: "first part",
    Y: "second part",
    A: "first part",
    B: "second part"
  };

  function contextualPlaceholder(token, item) {
    const category = item?.category || "";
    if (token === "A") {
      if (category === "copula" || category === "location") return "person / thing";
      if (category === "comparison") return "first thing";
    }
    if (token === "B") {
      if (category === "copula") return "identity / category";
      if (category === "comparison") return "second thing";
    }
    return PLACEHOLDER_LABELS[token] || token.toLowerCase();
  }

  function humanizeTemplate(text, item) {
    let output = String(text || "");
    const tokens = Object.keys(PLACEHOLDER_LABELS).sort((a, b) => b.length - a.length);
    tokens.forEach(token => {
      const pattern = new RegExp(`(^|[^A-Za-z])${token}(?=$|[^A-Za-z])`, "g");
      output = output.replace(pattern, (match, prefix) => `${prefix}[${contextualPlaceholder(token, item)}]`);
    });
    return output.replace(/\s*\+\s*/g, " + ").replace(/\s{2,}/g, " ").trim();
  }

  function isComprehensionKind(kind) {
    return kind.endsWith("S") || kind.endsWith("P");
  }

  function humanizedPattern(kind, item) {
    if (kind === "jpG" || kind === "yueG") return humanizeTemplate(item.pattern, item);
    if (isComprehensionKind(kind)) return item.text || "";
    return kind === "jpV" ? item.expression : item.word;
  }

  function humanizedReading(kind, item) {
    if (kind === "jpV") return item.reading || "";
    if (kind === "yueV") return item.jyutping || "";
    if (kind === "yueG") return humanizeTemplate(item.jyutping || "", item);
    if (isComprehensionKind(kind)) return item.reading || "";
    return "";
  }

  function meaningOf(item) {
    return item.translation || item.meaning || "";
  }

  function yueVocabLevel(item) {
    const rank = Number(item.frequency_rank) || Infinity;
    if (rank <= YUE_VOCAB_LIMITS.Beginner) return "Beginner";
    if (rank <= YUE_VOCAB_LIMITS.Intermediate) return "Intermediate";
    return "Advanced";
  }

  function itemLevel(kind, item) {
    if (kind === "yueV") return yueVocabLevel(item);
    return item.level || "Unclassified";
  }

  function japaneseVocabCollection(item) {
    const tags = String(item.tags || "");
    if (tags.includes("Genki")) return "Genki";
    if (tags.includes("Intermediate_Japanese")) return "Intermediate Japanese";
    if (tags.includes("JLPT")) return "JLPT core";
    return "Other";
  }

  function cantoneseVocabBand(item) {
    const rank = Number(item.frequency_rank) || Infinity;
    if (rank <= 1000) return "Top 1,000";
    if (rank <= 3000) return "Core 1,001–3,000";
    if (rank <= 12000) return "Common 3,001–12,000";
    return "Extended 12,001+";
  }

  function itemCategory(kind, item) {
    if (kind === "jpG" || kind === "yueG") return titleCase(item.category || "General");
    if (kind === "jpV") return japaneseVocabCollection(item);
    if (kind === "yueV") return cantoneseVocabBand(item);
    if (kind.endsWith("S")) return "Sentence comprehension";
    if (kind.endsWith("P")) return "Passage comprehension";
    return "General";
  }

  function grammarGuide(item) {
    const raw = `${item.pattern || ""} ${item.jyutping || ""}`;
    const found = [];
    Object.keys(PLACEHOLDER_LABELS).forEach(token => {
      const pattern = new RegExp(`(^|[^A-Za-z])${token}(?=$|[^A-Za-z])`);
      if (pattern.test(raw)) found.push(contextualPlaceholder(token, item));
    });
    const unique = [...new Set(found)];
    if (!unique.length) return "";
    const definitions = {
      "subject": "who or what the sentence is about",
      "object": "the person or thing receiving the action",
      "noun": "a person, place, thing, or idea",
      "verb": "an action or state word",
      "adjective": "a describing word, such as “good” or “busy”",
      "adverb": "a word that describes how an action happens",
      "clause": "a small sentence-like unit",
      "place": "a location",
      "hour": "the hour on the clock",
      "minutes": "the minute value",
      "classifier": "a counting word used with a noun",
      "pronoun": "a word such as I, you, or they",
      "request": "what you are asking someone to do",
      "topic": "what the sentence is mainly about",
      "comment": "what is said about the topic",
      "predicate": "the part that says what happens or describes the subject",
      "direct object": "the thing directly affected by the action",
      "indirect object": "the recipient or beneficiary of the action",
      "person / thing": "the person or thing being discussed",
      "identity / category": "what that person or thing is"
    };
    return unique.map(label => `[${label}] = ${definitions[label] || label}`).join(" · ");
  }

  function metadataParts(kind, item) {
    const parts = [itemLevel(kind, item), itemCategory(kind, item)];
    if (kind === "yueG" && item.register) parts.push(`${titleCase(item.register)} register`);
    if (kind === "yueV" && item.frequency_rank) parts.push(`Frequency #${Number(item.frequency_rank).toLocaleString()}`);
    return parts.filter(Boolean);
  }

  function displayMeta(kind, item) {
    return metadataParts(kind, item).join(" · ");
  }

  // ---------- exhaustive context coverage ----------

  const contextCache = new Map();

  function contextTargetLabel(kind, item) {
    return kind.endsWith("G") ? humanizedPattern(kind, item) : humanizedPattern(kind, item);
  }

  function authenticContexts(kind, item) {
    if (kind === "jpV") return CONTEXT.japanese?.vocabulary?.[item.id] || [];
    if (kind === "jpG") return CONTEXT.japanese?.grammar?.[item.id] || [];
    if (kind === "yueV") {
      const bundled = (item.examples || []).map(example => ({
        text: example.sentence || "",
        reading: example.jyutping || "",
        translation: example.meaning || "",
        source: "Bundled vocabulary example"
      })).filter(example => example.text);
      const corpus = (CONTEXT.cantonese?.corpus?.[item.id] || []).map(example => ({
        text: example.text || "",
        reading: example.jyutping || "",
        translation: "",
        source: example.source || "HKCanCor via PyCantonese"
      }));
      return [...bundled, ...corpus];
    }
    return [];
  }

  function japaneseFallbackContexts(kind, item) {
    const target = contextTargetLabel(kind, item);
    const meaning = meaningOf(item);
    if (kind === "jpV") {
      const gloss = String(meaning || "").split(/[;,/]/)[0].trim();
      const reading = String(item.reading || item.expression || "");
      const looksVerb = /^to\s+/i.test(gloss) || /[うくぐすつぬぶむる]$/.test(reading) && /^to\b/i.test(String(meaning || ""));
      const looksAdjective = /adjective|\badj\.?\b|beautiful|good|bad|big|small|new|old|easy|difficult|busy|happy|sad|expensive|cheap/i.test(String(meaning || ""));
      if (looksVerb) {
        return [
          { text: `${target}ことは大切です。`, translation: `${gloss || target} is important.`, source: "AIDA generated usage context" },
          { text: `時間があれば、${target}つもりです。`, translation: `If I have time, I intend to ${gloss.replace(/^to\s+/i, "") || target}.`, source: "AIDA generated usage context" },
          { text: `毎日少しずつ${target}ようにしています。`, translation: `I try to ${gloss.replace(/^to\s+/i, "") || target} little by little every day.`, source: "AIDA generated usage context" }
        ];
      }
      if (looksAdjective) {
        return [
          { text: `これはとても${target}です。`, translation: `This is very ${gloss || target}.`, source: "AIDA generated usage context" },
          { text: `思ったより${target}です。`, translation: `It is ${gloss || target} compared with what I expected.`, source: "AIDA generated usage context" },
          { text: `本当に${target}と思います。`, translation: `I really think it is ${gloss || target}.`, source: "AIDA generated usage context" }
        ];
      }
      return [
        { text: `今日は${target}について話しました。`, translation: `Today we talked about ${gloss || target}.`, source: "AIDA generated usage context" },
        { text: `${target}は大切なテーマです。`, translation: `${gloss || target} is an important topic.`, source: "AIDA generated usage context" },
        { text: `最近、${target}に興味があります。`, translation: `Recently, I have been interested in ${gloss || target}.`, source: "AIDA generated usage context" }
      ];
    }
    return [
      { text: `この例では「${target}」という文型に注目します。`, translation: `This example focuses on the grammar pattern “${target}” (${meaning}).`, source: "AIDA generated grammar context" },
      { text: `「${target}」が文の意味にどう関わるか考えてみましょう。`, translation: `Consider how “${target}” contributes the meaning: ${meaning}.`, source: "AIDA generated grammar context" },
      { text: `別の文でも「${target}」を見つけられるように練習します。`, translation: `Practice recognizing “${target}” with the meaning: ${meaning}.`, source: "AIDA generated grammar context" }
    ];
  }

  const YUE_PLACEHOLDER_SETS = [
    { A: "我", B: "學生", S: "我", O: "呢本書", X: "今日", Y: "聽日", SUBJECT: "我", PLACE: "屋企", CLASSIFIER: "個", PRONOUN: "我", "DIRECT OBJECT": "呢本書", "INDIRECT OBJECT": "朋友", CLAUSE: "我今日返工", LOCATION: "屋企", TIME: "今日", PERSON: "朋友", SOURCE: "公司", VP: "食飯", PHRASE: "好快", "REDUPLICATED ADVERB": "慢慢", RESULT: "好攰", NUMBER: "三", "STATIVE VERB": "鍾意", "RELATIVE CLAUSE": "我昨日買", YEAR: "二零二六", MONTH: "七", DAY: "十一", HOUR: "三", MINUTES: "十五", DURATION: "兩", REQUEST: "幫我開門", VERB: "食飯", V: "食飯", NOUN: "朋友", N: "朋友", ADJ: "開心", CL: "個" },
    { A: "佢", B: "老師", S: "佢", O: "杯茶", X: "朝早", Y: "夜晚", SUBJECT: "佢", PLACE: "公司", CLASSIFIER: "本", PRONOUN: "佢", "DIRECT OBJECT": "杯茶", "INDIRECT OBJECT": "阿媽", CLAUSE: "佢聽日放假", LOCATION: "公司", TIME: "朝早", PERSON: "阿媽", SOURCE: "學校", VP: "返工", PHRASE: "好清楚", "REDUPLICATED ADVERB": "快快", RESULT: "好開心", NUMBER: "兩", "STATIVE VERB": "明白", "RELATIVE CLAUSE": "佢頭先講", YEAR: "二零二五", MONTH: "十二", DAY: "二十四", HOUR: "八", MINUTES: "三十", DURATION: "三", REQUEST: "畀杯水我", VERB: "返工", V: "返工", NOUN: "工作", N: "工作", ADJ: "方便", CL: "本" },
    { A: "我哋", B: "香港人", S: "我哋", O: "個問題", X: "而家", Y: "下次", SUBJECT: "我哋", PLACE: "學校", CLASSIFIER: "件", PRONOUN: "我哋", "DIRECT OBJECT": "個問題", "INDIRECT OBJECT": "老師", CLAUSE: "我哋學緊廣東話", LOCATION: "學校", TIME: "而家", PERSON: "老師", SOURCE: "屋企", VP: "學廣東話", PHRASE: "好自然", "REDUPLICATED ADVERB": "靜靜", RESULT: "好成功", NUMBER: "五", "STATIVE VERB": "需要", "RELATIVE CLAUSE": "我哋一齊做", YEAR: "二零二四", MONTH: "三", DAY: "一", HOUR: "十", MINUTES: "四十五", DURATION: "一", REQUEST: "再講一次", VERB: "學廣東話", V: "學廣東話", NOUN: "方法", N: "方法", ADJ: "重要", CL: "件" }
  ];
  const YUE_JYUTPING_PLACEHOLDER_SETS = [
    { A: "ngo5", B: "hok6 saang1", S: "ngo5", O: "ni1 bun2 syu1", X: "gam1 jat6", Y: "ting1 jat6", SUBJECT: "ngo5", PLACE: "uk1 kei2", CLASSIFIER: "go3", PRONOUN: "ngo5", "DIRECT OBJECT": "ni1 bun2 syu1", "INDIRECT OBJECT": "pang4 jau5", CLAUSE: "ngo5 gam1 jat6 faan1 gung1", LOCATION: "uk1 kei2", TIME: "gam1 jat6", PERSON: "pang4 jau5", SOURCE: "gung1 si1", VP: "sik6 faan6", PHRASE: "hou2 faai3", "REDUPLICATED ADVERB": "maan6 maan6", RESULT: "hou2 gui6", NUMBER: "saam1", "STATIVE VERB": "zung1 ji3", "RELATIVE CLAUSE": "ngo5 zok6 jat6 maai5", YEAR: "ji6 ling4 ji6 luk6", MONTH: "cat1", DAY: "sap6 jat1", HOUR: "saam1", MINUTES: "sap6 ng5", DURATION: "loeng5", REQUEST: "bong1 ngo5 hoi1 mun4", VERB: "sik6 faan6", V: "sik6 faan6", NOUN: "pang4 jau5", N: "pang4 jau5", ADJ: "hoi1 sam1", CL: "go3" },
    { A: "keoi5", B: "lou5 si1", S: "keoi5", O: "bui1 caa4", X: "ziu1 zou2", Y: "je6 maan5", SUBJECT: "keoi5", PLACE: "gung1 si1", CLASSIFIER: "bun2", PRONOUN: "keoi5", "DIRECT OBJECT": "bui1 caa4", "INDIRECT OBJECT": "aa3 maa1", CLAUSE: "keoi5 ting1 jat6 fong3 gaa3", LOCATION: "gung1 si1", TIME: "ziu1 zou2", PERSON: "aa3 maa1", SOURCE: "hok6 haau6", VP: "faan1 gung1", PHRASE: "hou2 cing1 co2", "REDUPLICATED ADVERB": "faai3 faai3", RESULT: "hou2 hoi1 sam1", NUMBER: "loeng5", "STATIVE VERB": "ming4 baak6", "RELATIVE CLAUSE": "keoi5 tau4 sin1 gong2", YEAR: "ji6 ling4 ji6 ng5", MONTH: "sap6 ji6", DAY: "ji6 sap6 sei3", HOUR: "baat3", MINUTES: "saam1 sap6", DURATION: "saam1", REQUEST: "bei2 bui1 seoi2 ngo5", VERB: "faan1 gung1", V: "faan1 gung1", NOUN: "gung1 zok3", N: "gung1 zok3", ADJ: "fong1 bin6", CL: "bun2" },
    { A: "ngo5 dei6", B: "hoeng1 gong2 jan4", S: "ngo5 dei6", O: "go3 man6 tai4", X: "ji4 gaa1", Y: "haa6 ci3", SUBJECT: "ngo5 dei6", PLACE: "hok6 haau6", CLASSIFIER: "gin6", PRONOUN: "ngo5 dei6", "DIRECT OBJECT": "go3 man6 tai4", "INDIRECT OBJECT": "lou5 si1", CLAUSE: "ngo5 dei6 hok6 gan2 gwong2 dung1 waa2", LOCATION: "hok6 haau6", TIME: "ji4 gaa1", PERSON: "lou5 si1", SOURCE: "uk1 kei2", VP: "hok6 gwong2 dung1 waa2", PHRASE: "hou2 zi6 jin4", "REDUPLICATED ADVERB": "zing6 zing6", RESULT: "hou2 sing4 gung1", NUMBER: "ng5", "STATIVE VERB": "seoi1 jiu3", "RELATIVE CLAUSE": "ngo5 dei6 jat1 cai4 zou6", YEAR: "ji6 ling4 ji6 sei3", MONTH: "saam1", DAY: "jat1", HOUR: "sap6", MINUTES: "sei3 sap6 ng5", DURATION: "jat1", REQUEST: "zoi3 gong2 jat1 ci3", VERB: "hok6 gwong2 dung1 waa2", V: "hok6 gwong2 dung1 waa2", NOUN: "fong1 faat3", N: "fong1 faat3", ADJ: "zung6 jiu3", CL: "gin6" }
  ];

  function replaceAsciiPlaceholders(text, replacements, joiner = "") {
    let output = String(text || "");
    Object.keys(replacements).sort((a, b) => b.length - a.length).forEach(token => {
      output = output.replace(new RegExp(`(^|[^A-Za-z])${token}(?=$|[^A-Za-z])`, "g"), (match, prefix) => `${prefix}${replacements[token]}`);
    });
    return output.replace(/\s*\+\s*/g, joiner).replace(/\s{2,}/g, " ").trim();
  }

  function cantoneseGrammarContexts(item) {
    const pattern = String(item.pattern || "").trim();
    const compactPattern = pattern.replace(/\s+/g, "");

    // A few grammar records are labels for fixed conversational expressions rather
    // than slot templates. Give those three genuinely different learner-facing uses
    // instead of repeating the same heading three times.
    if (compactPattern.includes("唔該/多謝") || (pattern.includes("唔該") && pattern.includes("多謝"))) {
      return [
        { text: "唔該，幫我開門。", reading: "m4 goi1, bong1 ngo5 hoi1 mun4.", translation: "Please help me open the door.", source: "AIDA grammar instantiation" },
        { text: "唔該晒你。", reading: "m4 goi1 saai3 nei5.", translation: "Thank you very much.", source: "AIDA grammar instantiation" },
        { text: "多謝你今日幫我。", reading: "do1 ze6 nei5 gam1 jat6 bong1 ngo5.", translation: "Thank you for helping me today.", source: "AIDA grammar instantiation" }
      ];
    }
    if (compactPattern.includes("對唔住/唔好意思") || (pattern.includes("對唔住") && pattern.includes("唔好意思"))) {
      return [
        { text: "對唔住，我遲到咗。", reading: "deoi3 m4 zyu6, ngo5 ci4 dou3 zo2.", translation: "Sorry, I was late.", source: "AIDA grammar instantiation" },
        { text: "唔好意思，阻你一陣。", reading: "m4 hou2 ji3 si1, zo2 nei5 jat1 zan6.", translation: "Excuse me for taking up a moment of your time.", source: "AIDA grammar instantiation" },
        { text: "真係對唔住。", reading: "zan1 hai6 deoi3 m4 zyu6.", translation: "I am really sorry.", source: "AIDA grammar instantiation" }
      ];
    }
    if (pattern.includes("...就...") || compactPattern === "…就…") {
      return [
        { text: "你去，我就去。", reading: "nei5 heoi3, ngo5 zau6 heoi3.", translation: "If you go, then I will go.", source: "AIDA grammar instantiation" },
        { text: "如果落雨，我哋就留喺屋企。", reading: "jyu4 gwo2 lok6 jyu5, ngo5 dei6 zau6 lau4 hai2 uk1 kei2.", translation: "If it rains, then we will stay at home.", source: "AIDA grammar instantiation" },
        { text: "做完功課就可以休息。", reading: "zou6 jyun4 gung1 fo3 zau6 ho2 ji5 jau1 sik1.", translation: "Once the homework is finished, you can rest.", source: "AIDA grammar instantiation" }
      ];
    }
    if (/ADJ\s*-\s*ADJ\s*-?\s*哋/i.test(pattern)) {
      return [
        { text: "大家開開心心哋食飯。", reading: "daai6 gaa1 hoi1 hoi1 sam1 sam1 dei2 sik6 faan6.", translation: "Everyone ate together happily.", source: "AIDA grammar instantiation" },
        { text: "佢快快脆脆哋做完份工。", reading: "keoi5 faai3 faai3 ceoi3 ceoi3 dei2 zou6 jyun4 fan6 gung1.", translation: "They finished the work quickly and efficiently.", source: "AIDA grammar instantiation" },
        { text: "我哋舒舒服服哋坐低傾偈。", reading: "ngo5 dei6 syu1 syu1 fuk6 fuk6 dei2 co5 dai1 king1 gai2.", translation: "We sat down comfortably and chatted.", source: "AIDA grammar instantiation" }
      ];
    }

    return YUE_PLACEHOLDER_SETS.map((replacements, index) => {
      let text = replaceAsciiPlaceholders(pattern, replacements, "");
      let reading = replaceAsciiPlaceholders(item.jyutping || "", YUE_JYUTPING_PLACEHOLDER_SETS[index], " ");
      if (text.includes("→")) text = text.split("→").pop().trim();
      if (reading.includes("→")) reading = reading.split("→").pop().trim();
      text = text.replace(/[\[\]()~～]/g, "").trim();
      reading = reading.replace(/[\[\]()~～]/g, "").trim().replace(/(?<=\d)(?=[A-Za-z])/g, " ");
      return {
        text: text || pattern,
        reading,
        translation: `Example of: ${item.meaning}`,
        source: "AIDA grammar instantiation"
      };
    });
  }

  function cantoneseFallbackContexts(kind, item) {
    if (kind === "yueG") return cantoneseGrammarContexts(item);
    const word = item.word || "";
    const jy = item.jyutping || "";
    const meaning = item.meaning || "";
    const gloss = String(meaning).split(/[;,/]/)[0].trim();
    const looksVerb = /^to\s+/i.test(gloss) || /\bverb\b/i.test(meaning);
    const looksAdjective = /adjective|\badj\.?\b|beautiful|good|bad|big|small|new|old|easy|difficult|busy|happy|sad|expensive|cheap/i.test(meaning);
    if (looksVerb) {
      const action = gloss.replace(/^to\s+/i, "") || word;
      return [
        { text: `我今日想${word}。`, reading: `ngo5 gam1 jat6 soeng2 ${jy}`, translation: `Today I want to ${action}.`, source: "AIDA generated usage context" },
        { text: `佢成日都${word}。`, reading: `keoi5 seng4 jat6 dou1 ${jy}`, translation: `They often ${action}.`, source: "AIDA generated usage context" },
        { text: `你可唔可以${word}？`, reading: `nei5 ho2 m4 ho2 ji5 ${jy}`, translation: `Can you ${action}?`, source: "AIDA generated usage context" }
      ];
    }
    if (looksAdjective) {
      return [
        { text: `呢樣嘢好${word}。`, reading: `ni1 joeng6 je5 hou2 ${jy}`, translation: `This is very ${gloss || word}.`, source: "AIDA generated usage context" },
        { text: `我覺得佢幾${word}。`, reading: `ngo5 gok3 dak1 keoi5 gei2 ${jy}`, translation: `I think it is quite ${gloss || word}.`, source: "AIDA generated usage context" },
        { text: `今日比琴日更加${word}。`, reading: `gam1 jat6 bei2 kam4 jat6 gang3 gaa1 ${jy}`, translation: `Today is even more ${gloss || word} than yesterday.`, source: "AIDA generated usage context" }
      ];
    }
    return [
      { text: `我今日見到${word}。`, reading: `ngo5 gam1 jat6 gin3 dou3 ${jy}`, translation: `Today I saw ${gloss || word}.`, source: "AIDA generated usage context" },
      { text: `呢個${word}對我好重要。`, reading: `ni1 go3 ${jy} deoi3 ngo5 hou2 zung6 jiu3`, translation: `This ${gloss || word} is important to me.`, source: "AIDA generated usage context" },
      { text: `我哋講緊關於${word}嘅事。`, reading: `ngo5 dei6 gong2 gan2 gwaan1 jyu1 ${jy} ge3 si6`, translation: `We are talking about ${gloss || word}.`, source: "AIDA generated usage context" }
    ];
  }

  function contextDifficultyScore(example, kind) {
    const text = String(example?.text || "");
    const length = [...text].length;
    const connectors = kind.startsWith("jp")
      ? (text.match(/ので|のに|けれど|ながら|ため|ところ|一方|にもかかわらず|ことから|わけ/g) || []).length
      : (text.match(/因為|所以|雖然|但係|如果|就|即使|不過|與其|不如|既然|一方面|另一方面/g) || []).length;
    const clauses = (text.match(/[、，,；;：:]/g) || []).length;
    return length + connectors * 14 + clauses * 5;
  }

  function contextVariations(kind, item) {
    if (!/^(jp|yue)[GV]$/.test(kind)) return [];
    const cacheKey = `${kind}:${item.id}`;
    if (contextCache.has(cacheKey)) return contextCache.get(cacheKey);
    const candidates = [
      ...authenticContexts(kind, item),
      ...(kind.startsWith("jp") ? japaneseFallbackContexts(kind, item) : cantoneseFallbackContexts(kind, item))
    ];
    const seen = new Set();
    const unique = [];
    for (const candidate of candidates) {
      const text = String(candidate.text || "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      unique.push({
        text,
        reading: candidate.reading || "",
        translation: candidate.translation || "",
        source: candidate.source || "AIDA context"
      });
      if (unique.length >= 3) break;
    }
    // Each item exposes its three contexts in an easier → harder order. The source
    // item's JLPT/Cantonese level still controls the overall session band; this
    // local ordering makes repeated encounters with the same item progressively denser.
    unique.sort((a, b) => contextDifficultyScore(a, kind) - contextDifficultyScore(b, kind));
    contextCache.set(cacheKey, unique);
    return unique;
  }

  function contextSentenceEntry(baseEntry, variantIndex = 0) {
    const variants = contextVariations(baseEntry.kind, baseEntry.item);
    const variant = variants[variantIndex % Math.max(1, variants.length)] || {};
    const lang = langFromKind(baseEntry.kind);
    const sentenceKind = lang === "jp" ? "jpS" : "yueS";
    const focus = humanizedPattern(baseEntry.kind, baseEntry.item);
    const meaning = meaningOf(baseEntry.item);
    return {
      kind: sentenceKind,
      item: {
        id: `ctx-s-${baseEntry.kind}-${baseEntry.item.id}-${variantIndex}`,
        level: itemLevel(baseEntry.kind, baseEntry.item),
        text: variant.text || focus,
        reading: variant.reading || "",
        translation: variant.translation || meaning,
        question: "What situation, action, or idea is expressed in this sentence?",
        answer: variant.translation || meaning,
        contextSource: variant.source || "AIDA context",
        _sourceKind: baseEntry.kind,
        _sourceId: baseEntry.item.id
      }
    };
  }

  function contextPassageEntry(baseEntry, variantIndex = 0) {
    const allVariants = contextVariations(baseEntry.kind, baseEntry.item);
    const lang = langFromKind(baseEntry.kind);
    const passageKind = lang === "jp" ? "jpP" : "yueP";
    const focus = humanizedPattern(baseEntry.kind, baseEntry.item);
    const meaning = meaningOf(baseEntry.item);
    // Three deterministic passage variations per source item. The first uses the
    // two easiest contexts, the second uses the two denser contexts, and the third
    // combines all three. Repeated encounters therefore become progressively harder.
    const passageSets = [
      allVariants.slice(0, 2),
      allVariants.slice(1, 3),
      allVariants.slice(0, 3)
    ];
    const variants = passageSets[variantIndex % 3].length ? passageSets[variantIndex % 3] : allVariants;
    const text = variants.map(example => {
      const value = String(example.text || "").trim();
      return value && !/[。！？!?]$/.test(value) ? `${value}。` : value;
    }).join("");
    const reading = variants.map(example => String(example.reading || "").trim()).filter(Boolean).join(" / ");
    const translations = variants.map(example => example.translation).filter(Boolean);
    const translation = translations.join(" ") || `A short context set built around “${focus}” (${meaning}).`;
    const firstMeaning = variants[0]?.translation || translation;
    const relationVariant = variants.find(example => /ので|から|ため|だから|もし|なら|ば|たら|のに|けれど|しかし|一方|因為|所以|如果|就|雖然|但係|不過|即使|與其|不如/.test(String(example.text || ""))) || variants[1] || variants[0];
    const relationText = String(relationVariant?.text || "");
    let relationType = "DEVELOPMENT";
    let relationQuestion = "What additional situation or idea is introduced after the opening sentence?";
    if (/ので|から|ため|だから|因為|所以/.test(relationText)) {
      relationType = "CAUSE / RESULT";
      relationQuestion = "What reason or cause is given, and what result follows from it?";
    } else if (/もし|なら|ば|たら|如果|就|即使/.test(relationText)) {
      relationType = "CONDITION";
      relationQuestion = "What condition is described, and what happens under that condition?";
    } else if (/のに|けれど|しかし|一方|雖然|但係|不過|與其|不如/.test(relationText)) {
      relationType = "CONTRAST";
      relationQuestion = "What contrast or alternative does the passage present?";
    }
    const questions = [
      {
        type: "DETAIL",
        question: "According to the first sentence, what happens or what is true?",
        answer: firstMeaning,
        keywordGroups: []
      },
      {
        type: relationType,
        question: relationQuestion,
        answer: relationVariant?.translation || translation,
        keywordGroups: []
      },
      {
        type: "SUMMARY",
        question: "Summarize the passage's overall situation or message in one or two sentences.",
        answer: translation,
        keywordGroups: []
      }
    ];
    return {
      kind: passageKind,
      item: {
        id: `ctx-p-${baseEntry.kind}-${baseEntry.item.id}-${variantIndex}`,
        level: itemLevel(baseEntry.kind, baseEntry.item),
        text,
        reading,
        translation,
        questions,
        contextSource: [...new Set(variants.map(example => example.source).filter(Boolean))].join(" · "),
        _sourceKind: baseEntry.kind,
        _sourceId: baseEntry.item.id
      }
    };
  }

  function materializeStudyEntry(entry, index = 0) {
    const base = sourceEntryFor(entry);
    const exposure = srsFor(itemKey(base.kind, base.item)).seen || 0;
    const progressiveVariant = exposure % 3;
    if (entry.contextMode === "sentence") return contextSentenceEntry(entry, progressiveVariant);
    if (entry.contextMode === "passage") return contextPassageEntry(entry, progressiveVariant);
    return entry;
  }

  function contextHtml(kind, item) {
    const examples = contextVariations(kind, item);
    if (!examples.length) return "";
    const readingLabel = kind.startsWith("yue") ? "Jyutping" : "Reading";
    return `
      <div class="context-section-head"><span>Context variations</span><small>3 ways to meet this item in context</small></div>
      <div class="context-variation-grid">
        ${examples.map((example, index) => `
          <article class="context-variation-card">
            <span>${["EASIER", "BUILD", "HARDER"][index] || String(index + 1).padStart(2, "0")}</span>
            <p class="context-target ${kind.startsWith("yue") ? "canto-ruby" : ""}">${kind.startsWith("yue") && example.reading ? cantoneseRubyHtml(example.text, example.reading) : escapeHtml(example.text)}</p>
            ${example.reading ? `<p class="context-reading"><b>${readingLabel}</b>${escapeHtml(example.reading)}</p>` : ""}
            ${example.translation ? `<p class="context-translation">${escapeHtml(example.translation)}</p>` : ""}
            <small>${escapeHtml(example.source || "AIDA context")}</small>
          </article>`).join("")}
      </div>`;
  }

  // ---------- target scopes ----------

  function allowedJapaneseLevels(target) {
    const index = JP_LEVELS.indexOf(target);
    return index >= 0 ? JP_LEVELS.slice(0, index + 1) : ["N5"];
  }

  function allowedCantoneseLevels(target) {
    const index = YUE_LEVELS.indexOf(target);
    return index >= 0 ? YUE_LEVELS.slice(0, index + 1) : ["Beginner"];
  }

  function targetScopeText(lang) {
    if (lang === "jp") {
      const target = state.profile.jpTarget;
      const levels = allowedJapaneseLevels(target);
      return levels.length === 1 ? `${target} material only` : `${levels.join(" + ")} material`;
    }
    const target = state.profile.yueTarget;
    const levels = allowedCantoneseLevels(target);
    return levels.length === 1 ? `${target} material only` : `${levels.join(" + ")} material`;
  }

  function inTarget(kind, item, lang) {
    if (lang === "jp") return allowedJapaneseLevels(state.profile.jpTarget).includes(item.level);
    if (kind === "yueV") return Number(item.frequency_rank) <= YUE_VOCAB_LIMITS[state.profile.yueTarget];
    return allowedCantoneseLevels(state.profile.yueTarget).includes(item.level);
  }

  function baseStudyEntries(lang) {
    const grammarKind = lang === "jp" ? "jpG" : "yueG";
    const vocabKind = lang === "jp" ? "jpV" : "yueV";
    return [
      ...source[grammarKind].filter(item => inTarget(grammarKind, item, lang)).map(item => ({ kind: grammarKind, item })),
      ...source[vocabKind].filter(item => inTarget(vocabKind, item, lang)).map(item => ({ kind: vocabKind, item }))
    ];
  }

  function studyPool(lang, focus) {
    const grammarKind = lang === "jp" ? "jpG" : "yueG";
    const vocabKind = lang === "jp" ? "jpV" : "yueV";
    const sentenceKind = lang === "jp" ? "jpS" : "yueS";
    const passageKind = lang === "jp" ? "jpP" : "yueP";
    const grammar = source[grammarKind].filter(item => inTarget(grammarKind, item, lang)).map(item => ({ kind: grammarKind, item }));
    const vocabulary = source[vocabKind].filter(item => inTarget(vocabKind, item, lang)).map(item => ({ kind: vocabKind, item }));
    const sentences = source[sentenceKind].filter(item => inTarget(sentenceKind, item, lang)).map(item => ({ kind: sentenceKind, item }));
    const passages = source[passageKind].filter(item => inTarget(passageKind, item, lang)).map(item => ({ kind: passageKind, item }));
    const bases = [...grammar, ...vocabulary];
    if (focus === "grammar") return grammar;
    if (focus === "vocabulary") return vocabulary;
    // Every vocabulary and grammar item participates in sentence/passage practice.
    // Context is materialized only after sampling, so the app does not duplicate 50k+ source items in memory.
    if (focus === "sentences") return [...sentences, ...bases.map(entry => ({ ...entry, contextMode: "sentence" }))];
    if (focus === "passages") return [...passages, ...bases.map(entry => ({ ...entry, contextMode: "passage" }))];
    return [...grammar, ...vocabulary, ...sentences, ...passages];
  }

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function prioritizedSample(entries, count) {
    const unseen = shuffled(entries.filter(entry => !state.srs[baseItemKey(entry)]));
    const learned = shuffled(entries.filter(entry => state.srs[baseItemKey(entry)]));
    return [...unseen, ...learned].slice(0, count);
  }

  function progressiveSample(entries, count, lang) {
    const levels = lang === "jp" ? allowedJapaneseLevels(state.profile.jpTarget) : allowedCantoneseLevels(state.profile.yueTarget);
    const groups = levels.map(level => entries.filter(entry => {
      const base = sourceEntryFor(entry);
      return itemLevel(base.kind, base.item) === level;
    }));
    const selected = [];
    const used = new Set();
    if (count <= 0) return selected;
    let remaining = count;
    groups.forEach((group, index) => {
      if (!group.length || remaining <= 0) return;
      const groupsLeft = groups.slice(index).filter(candidate => candidate.length).length || 1;
      const quota = Math.max(1, Math.floor(remaining / groupsLeft));
      prioritizedSample(group, Math.min(quota, remaining)).forEach(entry => {
        const key = `${entry.contextMode || "base"}:${baseItemKey(entry)}`;
        if (!used.has(key)) { used.add(key); selected.push(entry); remaining -= 1; }
      });
    });
    if (remaining > 0) {
      prioritizedSample(entries, count * 3).forEach(entry => {
        if (remaining <= 0) return;
        const key = `${entry.contextMode || "base"}:${baseItemKey(entry)}`;
        if (!used.has(key)) { used.add(key); selected.push(entry); remaining -= 1; }
      });
    }
    return selected.slice(0, count);
  }

  function difficultyScore(entry) {
    const base = sourceEntryFor(entry);
    const lang = langFromKind(base.kind);
    const level = itemLevel(base.kind, base.item);
    const levelIndex = lang === "jp" ? Math.max(0, JP_LEVELS.indexOf(level)) : Math.max(0, YUE_LEVELS.indexOf(level));
    let within = 0;
    if (base.kind === "yueV") within = Math.min(99999, Number(base.item.frequency_rank) || 99999);
    else if (base.kind === "jpG") within = (Number(base.item.lesson) || 999) * 20 + String(base.item.pattern || "").length;
    else if (base.kind === "yueG") within = String(base.item.pattern || "").length * 10;
    else if (base.kind === "jpV") within = String(base.item.reading || base.item.expression || "").length * 100 + String(base.item.expression || "").length;
    else within = String(entry.item.text || "").length * 10;
    const kindOffset = entry.kind.endsWith("V") ? 0 : entry.kind.endsWith("G") ? 10000 : entry.kind.endsWith("S") ? 20000 : 40000;
    return levelIndex * 1_000_000 + kindOffset + within;
  }

  function progressiveOrder(entries) {
    return [...entries].sort((a, b) => difficultyScore(a) - difficultyScore(b));
  }

  function buildStudyItems(lang, focus, count) {
    if (focus !== "mixed") {
      const picked = progressiveSample(studyPool(lang, focus), count, lang);
      return progressiveOrder(picked.map((entry, index) => materializeStudyEntry(entry, index)));
    }

    const buckets = [
      { focus: "vocabulary", weight: 0.30 },
      { focus: "grammar", weight: 0.30 },
      { focus: "sentences", weight: 0.25 },
      { focus: "passages", weight: 0.15 }
    ].map(bucket => ({ ...bucket, entries: studyPool(lang, bucket.focus) }));

    const selected = [];
    const used = new Set();
    buckets.forEach(bucket => {
      let quota = Math.floor(count * bucket.weight);
      if (bucket.focus === "passages" && count >= 5) quota = Math.max(1, quota);
      if (bucket.focus === "sentences" && count >= 4) quota = Math.max(1, quota);
      progressiveSample(bucket.entries, quota, lang).forEach(entry => {
        const key = `${entry.contextMode || "base"}:${baseItemKey(entry)}`;
        if (!used.has(key)) { used.add(key); selected.push(entry); }
      });
    });

    if (selected.length < count) {
      const fallback = [
        ...studyPool(lang, "vocabulary"),
        ...studyPool(lang, "grammar"),
        ...studyPool(lang, "sentences"),
        ...studyPool(lang, "passages")
      ];
      progressiveSample(fallback, count * 4, lang).forEach(entry => {
        if (selected.length >= count) return;
        const key = `${entry.contextMode || "base"}:${baseItemKey(entry)}`;
        if (!used.has(key)) { used.add(key); selected.push(entry); }
      });
    }
    return progressiveOrder(selected.slice(0, count).map((entry, index) => materializeStudyEntry(entry, index)));
  }

  // ---------- audio ----------

  let speechVoices = [];
  let voiceLoadPromise = null;

  function voiceIdentity(voice) {
    return voice ? (voice.voiceURI || `${voice.name}@@${voice.lang}`) : "";
  }

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return [];
    speechVoices = window.speechSynthesis.getVoices() || [];
    populateVoiceSelectors();
    renderAudioStatus();
    return speechVoices;
  }

  function ensureVoices() {
    if (!("speechSynthesis" in window)) return Promise.resolve([]);
    refreshVoices();
    if (speechVoices.length) return Promise.resolve(speechVoices);
    if (voiceLoadPromise) return voiceLoadPromise;
    voiceLoadPromise = new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        refreshVoices();
        if (speechVoices.length) {
          settled = true;
          resolve(speechVoices);
        }
      };
      window.speechSynthesis.addEventListener?.("voiceschanged", finish, { once: true });
      setTimeout(finish, 250);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          refreshVoices();
          resolve(speechVoices);
        }
      }, 1600);
    }).finally(() => { voiceLoadPromise = null; });
    return voiceLoadPromise;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
    refreshVoices();
  }

  function voiceScore(voice, lang) {
    const locale = normalize(voice.lang);
    const name = normalize(voice.name);
    let score = 0;
    if (lang === "jp") {
      if (locale === "ja-jp") score += 180;
      else if (locale.startsWith("ja")) score += 150;
      if (/nanami|haruka|ayumi|kyoko|otoya|ichiro|japanese/.test(name)) score += 20;
    } else {
      // Microsoft exposes genuine Cantonese voices under both yue-CN and Hong Kong locales.
      if (locale === "yue-cn") score += 210;
      else if (locale === "yue-hk") score += 205;
      else if (locale.startsWith("yue")) score += 195;
      else if (locale === "zh-hk") score += 185;
      else if (locale.startsWith("zh-hk")) score += 175;
      if (/xiaomin|晓敏|曉敏|yunsong|云松|雲松|hiumaan|hiugaai|wanlung|cantonese|hong kong|hongkong|廣東|粤语|粵語/.test(name)) score += 45;
      if (/mandarin|putonghua|普通话|普通話/.test(name)) score -= 150;
    }
    if (voice.default) score += 2;
    return score;
  }

  function selectedVoice(lang) {
    const id = state.audio?.[lang === "jp" ? "jpVoiceId" : "yueVoiceId"] || "";
    return id ? speechVoices.find(voice => voiceIdentity(voice) === id) || null : null;
  }

  function pickVoice(lang) {
    const manual = selectedVoice(lang);
    if (manual && voiceScore(manual, lang) > 0) return manual;
    return speechVoices
      .map(voice => ({ voice, score: voiceScore(voice, lang) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.voice || null;
  }

  function populateVoiceSelectors() {
    const configs = [
      { id: "#jpVoiceSelect", lang: "jp", stateKey: "jpVoiceId" },
      { id: "#yueVoiceSelect", lang: "yue", stateKey: "yueVoiceId" }
    ];
    configs.forEach(config => {
      const select = $(config.id);
      if (!select) return;
      const matching = speechVoices
        .filter(voice => voiceScore(voice, config.lang) > 0)
        .sort((a, b) => voiceScore(b, config.lang) - voiceScore(a, config.lang));
      const current = state.audio?.[config.stateKey] || "";
      select.innerHTML = `<option value="">Automatic — best detected voice</option>${matching.map(voice => `<option value="${escapeHtml(voiceIdentity(voice))}">${escapeHtml(voice.name)} · ${escapeHtml(voice.lang)}${voice.localService ? " · local" : " · online"}</option>`).join("")}`;
      select.value = matching.some(voice => voiceIdentity(voice) === current) ? current : "";
    });
  }

  function stripTemplatePlaceholders(text) {
    let output = String(text || "");
    Object.keys(PLACEHOLDER_LABELS).sort((a, b) => b.length - a.length).forEach(token => {
      const pattern = new RegExp(`(^|[^A-Za-z])${token}(?=$|[^A-Za-z])`, "g");
      output = output.replace(pattern, "$1 ");
    });
    return output.replace(/[+~〜\[\]()]/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  function speechText(kind, item) {
    if (kind === "jpV") return item.reading || item.expression || "";
    if (kind === "yueV") return item.word || "";
    if (isComprehensionKind(kind)) return item.text || "";
    return stripTemplatePlaceholders(item.pattern || "");
  }

  function renderAudioStatus() {
    const container = $("#audioStatus");
    if (!container) return;
    if (!("speechSynthesis" in window)) {
      container.innerHTML = '<div class="audio-status-row bad"><strong>Browser audio</strong><span>Speech synthesis is unavailable.</span></div>';
      return;
    }
    const jp = pickVoice("jp");
    const yue = pickVoice("yue");
    const yueCandidates = speechVoices.filter(voice => voiceScore(voice, "yue") > 0);
    container.innerHTML = `
      <div class="audio-status-row ${jp ? "good" : "bad"}"><strong>Japanese</strong><span>${jp ? escapeHtml(`${jp.name} · ${jp.lang}`) : "No Japanese voice detected"}</span></div>
      <div class="audio-status-row ${yue ? "good" : "neutral"}"><strong>Cantonese</strong><span>${yue ? escapeHtml(`${yue.name} · ${yue.lang}`) : "No enumerated Cantonese voice · AIDA will still try the browser's yue-CN locale fallback"}</span></div>
      <div class="audio-status-row neutral"><strong>Detected voices</strong><span>${speechVoices.length} total · ${yueCandidates.length} Cantonese candidate${yueCandidates.length === 1 ? "" : "s"}</span></div>
      <div class="audio-status-row neutral"><strong>Hosted fallback</strong><span>/api/cantonese-tts · used automatically when configured and no browser Cantonese voice is available</span></div>
      ${yue ? "" : '<p class="audio-help">AIDA first looks for a genuine yue-CN / yue-HK / zh-HK browser voice. If none is exposed, it tries the included same-origin hosted TTS endpoint, then finally a browser yue-CN locale fallback. Configure the serverless endpoint for deterministic Cantonese audio.</p>'}`;
    populateVoiceSelectors();
  }

  function splitSpeechChunks(text, maxLength = 140) {
    const sentences = String(text || "").match(/[^。！？!?；;]+[。！？!?；;]?/g) || [String(text || "")];
    const chunks = [];
    let current = "";
    sentences.forEach(sentence => {
      if ((current + sentence).length > maxLength && current) {
        chunks.push(current.trim());
        current = sentence;
      } else current += sentence;
    });
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function speakChunk(text, lang, voice) {
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang || (lang === "jp" ? "ja-JP" : "yue-CN");
      if (voice) utterance.voice = voice;
      utterance.rate = lang === "jp" ? 0.86 : 0.78;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => resolve(true);
      utterance.onerror = event => {
        console.warn("AIDA speech error", event.error, voice?.name, voice?.lang);
        resolve(false);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function playAudioBlob(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const finish = success => {
        URL.revokeObjectURL(url);
        resolve(success);
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.play().catch(() => finish(false));
    });
  }

  async function speakCantoneseCloud(text) {
    // Optional same-origin serverless fallback. It keeps the Azure key off the client.
    // On GitHub Pages or file:// this endpoint simply does not exist and AIDA falls back
    // to the browser's own yue-CN voice routing.
    if (!text || location.protocol === "file:") return false;
    try {
      const response = await fetch("/api/cantonese-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) return false;
      const type = response.headers.get("content-type") || "";
      if (!type.startsWith("audio/")) return false;
      return await playAudioBlob(await response.blob());
    } catch (error) {
      console.info("AIDA hosted Cantonese TTS fallback unavailable", error?.message || error);
      return false;
    }
  }

  async function speakItem(kind, item) {
    if (!("speechSynthesis" in window)) {
      showToast("Speech synthesis is not available in this browser.");
      return;
    }
    const lang = langFromKind(kind);
    const text = speechText(kind, item);
    if (!text) {
      showToast("This item does not contain pronounceable target-language text.");
      return;
    }
    await ensureVoices();
    const voice = pickVoice(lang);
    if (!voice && lang !== "yue") {
      renderAudioStatus();
      showToast("No Japanese voice is exposed by this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const chunks = splitSpeechChunks(text);

    // A static browser page cannot manufacture a Cantonese voice. When no genuine
    // Cantonese browser voice is exposed, try the optional same-origin Azure proxy first.
    if (lang === "yue" && !voice) {
      let cloudSuccess = true;
      for (const chunk of chunks) {
        if (!(await speakCantoneseCloud(chunk))) { cloudSuccess = false; break; }
      }
      if (cloudSuccess) {
        showToast("Played with hosted Cantonese neural speech.");
        return;
      }
    }

    let success = true;
    for (const chunk of chunks) {
      // Sequential chunks are more reliable for long passages than one oversized utterance.
      // For Cantonese only, a null voice still carries lang=yue-CN. Some browsers can
      // route that locale to an installed system voice even when getVoices() did not enumerate it.
      if (!(await speakChunk(chunk, lang, voice))) { success = false; break; }
    }

    // If an explicitly selected browser voice fails, give the hosted fallback one chance.
    if (!success && lang === "yue") {
      let cloudSuccess = true;
      for (const chunk of chunks) {
        if (!(await speakCantoneseCloud(chunk))) { cloudSuccess = false; break; }
      }
      if (cloudSuccess) {
        showToast("The browser voice failed, so AIDA used hosted Cantonese neural speech instead.");
        return;
      }
    }

    if (!success) {
      const voiceLabel = voice?.name || "the browser's yue-CN locale fallback";
      showToast(`The browser could not play ${languageName(lang)} with ${voiceLabel}. Configure the optional hosted TTS endpoint or choose another voice in Profile → Audio setup.`);
    } else if (!voice && lang === "yue") {
      showToast("Played using the browser's yue-CN locale fallback. For guaranteed Cantonese, configure the optional hosted TTS endpoint included with this project.");
    }
  }

  // ---------- study engine ----------

  const studyDialog = $("#studyStudio");
  let study = {
    lang: state.preferredStudyLanguage || "jp",
    items: [],
    index: 0,
    ratings: [],
    revealed: false
  };

  function applyStudyLanguage(lang) {
    study.lang = lang === "yue" ? "yue" : "jp";
    state.preferredStudyLanguage = study.lang;
    $$('[data-study-switch]').forEach(button => button.classList.toggle("active", button.dataset.studySwitch === study.lang));

    const japanese = study.lang === "jp";
    $("#studyLanguageKicker").textContent = japanese ? "JAPANESE TRACK" : "CANTONESE TRACK";
    $("#studyDialogTitle").textContent = japanese ? "Study Japanese" : "Study Cantonese";
    $("#studySetupHeading").textContent = japanese
      ? `Study Japanese through ${state.profile.jpTarget}.`
      : `Study Cantonese through ${state.profile.yueTarget}.`;
    $("#studySetupDescription").textContent = japanese
      ? "Your target is cumulative: N4 includes N5 + N4, N3 includes N5 + N4 + N3, and nothing above your target."
      : "Your target is cumulative: Intermediate includes Beginner + Intermediate, and Advanced includes every Cantonese band.";
    $("#studyScopeCallout").innerHTML = `<strong>Current scope</strong><span>${escapeHtml(targetScopeText(study.lang))}</span>`;
  }

  function openStudy(lang = state.preferredStudyLanguage || "jp") {
    applyStudyLanguage(lang);
    $("#studySetup").classList.remove("hidden");
    $("#studySession").classList.add("hidden");
    $("#studyComplete").classList.add("hidden");
    $("#studySessionProgress").textContent = `${dueEntries(lang).length} due · ${learnedEntries(lang).length} learned`;
    showDialog(studyDialog);
  }

  function generateSession() {
    const focus = $("#studyFocus").value;
    const count = clamp(Number($("#studyLength").value) || 10, 1, 100);
    const items = buildStudyItems(study.lang, focus, count);
    if (!items.length) {
      showToast("No items match this target and session focus.");
      return;
    }

    study = { ...study, items, index: 0, ratings: [], revealed: false };
    $("#studySetup").classList.add("hidden");
    $("#studyComplete").classList.add("hidden");
    $("#studySession").classList.remove("hidden");
    renderStudyItem();
  }

  function studyTypeLabel(kind) {
    if (kind.endsWith("G")) return "GRAMMAR";
    if (kind.endsWith("V")) return "VOCABULARY";
    if (kind.endsWith("P")) return "PASSAGE";
    return "SENTENCE";
  }

  let passageAssessment = null;

  function passageQuestionsFor(item) {
    if (Array.isArray(item.questions) && item.questions.length) return item.questions;
    if (item.question && item.answer) {
      return [{ type: "comprehension", prompt: item.question, answer: item.answer, keywordGroups: [] }];
    }
    return [];
  }

  function resetPassageAssessment(entry) {
    const questions = passageQuestionsFor(entry.item);
    passageAssessment = {
      entry,
      questions,
      index: 0,
      correct: 0,
      results: [],
      checked: false
    };
    $("#passageText").textContent = entry.item.text || "";
    $("#passageReferenceText").textContent = entry.item.text || "";
    $("#passageReadingStage").classList.remove("hidden");
    $("#passageQuestionStage").classList.add("hidden");
    $("#passageResultStage").classList.add("hidden");
    $("#passageFeedback").classList.add("hidden");
    $("#passageResponse").value = "";
  }

  function renderStudyItem() {
    const entry = study.items[study.index];
    if (!entry) {
      finishStudy();
      return;
    }

    const { kind, item } = entry;
    const percent = (study.index / study.items.length) * 100;
    const grammar = kind.endsWith("G");
    const comprehension = isComprehensionKind(kind);
    const passage = kind.endsWith("P");
    study.revealed = false;

    $("#sessionProgressBar").style.width = `${percent}%`;
    $("#studySessionProgress").textContent = `${study.index + 1} / ${study.items.length}`;
    $("#studyItemType").textContent = studyTypeLabel(kind);
    $("#studyItemLevel").textContent = itemLevel(kind, item);

    $("#standardStudyExperience").classList.toggle("hidden", passage);
    $("#passageStudyExperience").classList.toggle("hidden", !passage);

    if (passage) {
      resetPassageAssessment(entry);
      return;
    }

    $("#studyLanguageLabel").textContent = study.lang === "jp" ? "日本語 · JAPANESE" : "廣東話 · CANTONESE";
    $("#studyMain").textContent = humanizedPattern(kind, item);
    $("#studyQuestion").textContent = comprehension ? item.question : "Recall the meaning and usage, then reveal the answer.";
    const reading = humanizedReading(kind, item);
    $("#studyReadingLabel").textContent = study.lang === "yue" ? "Jyutping" : "Reading";
    $("#studyReading").textContent = reading;
    $("#studyReadingBlock").classList.toggle("hidden", !reading);
    $("#studyMeaning").textContent = meaningOf(item);
    $("#studyMeta").textContent = [displayMeta(kind, item), item.contextSource].filter(Boolean).join(" · ");

    const guide = comprehension
      ? `Answer: ${item.answer}`
      : grammar ? `${item.usage_note || ""}${grammarGuide(item) ? ` ${grammarGuide(item)}` : ""}`.trim() : "";
    $("#studyGuide").classList.toggle("hidden", !guide);
    $("#studyGuide").textContent = guide;

    const contexts = /^(jp|yue)[GV]$/.test(kind) ? contextHtml(kind, item) : "";
    $("#studyContexts").classList.toggle("hidden", !contexts);
    $("#studyContexts").innerHTML = contexts;
    $("#speakCurrent").disabled = !speechText(kind, item);

    $("#singleStudyCard").classList.remove("revealed");
    $("#studyAnswer").classList.add("hidden");
    $("#studyActions").classList.add("hidden");
    $("#studyRevealHint").classList.remove("hidden");
  }

  function revealStudyCard() {
    if (study.revealed) return;
    study.revealed = true;
    const entry = study.items[study.index];
    if (entry && study.lang === "yue") {
      const reading = humanizedReading(entry.kind, entry.item);
      if (reading) $("#studyMain").innerHTML = cantoneseRubyHtml(humanizedPattern(entry.kind, entry.item), reading);
    }
    $("#singleStudyCard").classList.add("revealed");
    $("#studyAnswer").classList.remove("hidden");
    $("#studyActions").classList.remove("hidden");
    $("#studyRevealHint").classList.add("hidden");
  }

  function rateCurrent(rating) {
    if (!study.revealed) {
      revealStudyCard();
      return;
    }
    const entry = study.items[study.index];
    if (!entry) return;
    scheduleEntry(entry, rating);
    study.ratings.push(rating);
    study.index += 1;
    if (study.index >= study.items.length) finishStudy();
    else renderStudyItem();
  }

  function normalizeFreeResponse(value) {
    return normalize(value)
      .replace(/[^a-z0-9぀-ヿ㐀-鿿\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function passageMatchEstimate(response, question) {
    const user = normalizeFreeResponse(response);
    if (!user) return 0;
    const groups = Array.isArray(question.keywordGroups) ? question.keywordGroups : [];
    let groupScore = 0;
    if (groups.length) {
      const matched = groups.filter(group => group.some(term => user.includes(normalizeFreeResponse(term)))).length;
      groupScore = matched / groups.length;
    }

    const stop = new Set(["the","a","an","is","are","was","were","to","of","and","or","in","on","at","for","that","because","it","they","he","she","their","with","by"]);
    const referenceTokens = normalizeFreeResponse(question.answer).split(" ").filter(token => token.length > 2 && !stop.has(token));
    const overlap = referenceTokens.length
      ? referenceTokens.filter(token => user.includes(token)).length / referenceTokens.length
      : 0;
    return clamp(Math.round(Math.max(groupScore, overlap * 0.85) * 100), 0, 100);
  }

  function startPassageQuestions() {
    if (!passageAssessment?.questions.length) {
      showToast("This passage does not contain comprehension questions yet.");
      return;
    }
    $("#passageReadingStage").classList.add("hidden");
    $("#passageQuestionStage").classList.remove("hidden");
    renderPassageQuestion();
  }

  function renderPassageQuestion() {
    if (!passageAssessment) return;
    const question = passageAssessment.questions[passageAssessment.index];
    if (!question) {
      finishPassageAssessment();
      return;
    }
    passageAssessment.checked = false;
    const total = passageAssessment.questions.length;
    $("#passageQuestionCount").textContent = `Question ${passageAssessment.index + 1} of ${total}`;
    $("#passageQuestionRail").style.width = `${(passageAssessment.index / total) * 100}%`;
    $("#passageQuestionType").textContent = titleCase(question.type || "comprehension");
    $("#passageQuestionPrompt").textContent = question.prompt || question.question || "What is the main idea of this passage?";
    $("#passageResponse").value = "";
    $("#passageResponse").disabled = false;
    $("#checkPassageAnswer").disabled = false;
    $("#passageFeedback").classList.add("hidden");
    $("#passageResponse").focus();
  }

  function checkPassageAnswer() {
    if (!passageAssessment || passageAssessment.checked) return;
    const response = $("#passageResponse").value.trim();
    if (!response) {
      showToast("Write an answer before checking it.");
      return;
    }
    const question = passageAssessment.questions[passageAssessment.index];
    const estimate = passageMatchEstimate(response, question);
    passageAssessment.checked = true;
    $("#passageResponse").disabled = true;
    $("#checkPassageAnswer").disabled = true;
    $("#passageMatchScore").textContent = `${estimate}%`;
    $("#passageReferenceAnswer").textContent = question.answer || "";
    $("#passageFeedback").classList.remove("hidden");
    $("#passageFeedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function selfGradePassageQuestion(correct) {
    if (!passageAssessment?.checked) return;
    const question = passageAssessment.questions[passageAssessment.index];
    const response = $("#passageResponse").value.trim();
    const estimate = passageMatchEstimate(response, question);
    passageAssessment.results.push({ correct, estimate, response });
    if (correct) passageAssessment.correct += 1;
    state.answers[study.lang][correct ? "correct" : "wrong"] += 1;
    passageAssessment.index += 1;
    if (passageAssessment.index >= passageAssessment.questions.length) finishPassageAssessment();
    else renderPassageQuestion();
  }

  function finishPassageAssessment() {
    if (!passageAssessment) return;
    const { entry, questions, correct } = passageAssessment;
    const accuracy = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    const rating = accuracy >= 90 ? 5 : accuracy >= 70 ? 4 : accuracy >= 40 ? 2 : 1;
    scheduleEntry(entry, rating);
    study.ratings.push(rating);

    $("#passageQuestionStage").classList.add("hidden");
    $("#passageResultStage").classList.remove("hidden");
    $("#passageScoreOrb").textContent = `${accuracy}%`;
    $("#passageResultSummary").textContent = `${correct} of ${questions.length} questions marked correct. The passage was scheduled as ${rating === 5 ? "Easy" : rating === 4 ? "Good" : rating === 2 ? "Hard" : "Again"}.`;
    const resultReading = humanizedReading(entry.kind, entry.item);
    $("#passageResultReadingLabel").textContent = study.lang === "yue" ? "Jyutping over text" : "Reading";
    if (study.lang === "yue" && resultReading) {
      $("#passageResultReading").classList.add("canto-ruby", "passage-ruby-result");
      $("#passageResultReading").innerHTML = cantoneseRubyHtml(entry.item.text || "", resultReading);
    } else {
      $("#passageResultReading").classList.remove("canto-ruby", "passage-ruby-result");
      $("#passageResultReading").textContent = resultReading || "No separate reading guide is bundled for this passage.";
    }
    $("#passageResultTranslation").textContent = meaningOf(entry.item) || "No translation is bundled for this passage.";
  }

  function continueAfterPassage() {
    study.index += 1;
    passageAssessment = null;
    if (study.index >= study.items.length) finishStudy();
    else renderStudyItem();
  }

  function finishStudy() {
    const lang = study.lang;
    state.sessions[lang] += 1;
    state.lastSession = { date: Date.now(), count: study.items.length, lang };
    saveState();

    $("#studySession").classList.add("hidden");
    $("#studyComplete").classList.remove("hidden");
    const earned = study.ratings.reduce((sum, rating) => sum + (XP_AWARDS[rating] || 0), 0);
    $("#completeXp").textContent = earned;
    $("#completeReviewed").textContent = study.items.length;
    $("#completeDue").textContent = dueEntries(lang).length;
    $("#studyCompleteSummary").textContent = `You studied ${study.items.length} ${languageName(lang)} items. Only ${languageName(lang)} XP, activity, and review history were updated.`;
  }

  // ---------- review engine ----------

  const reviewDialog = $("#reviewStudio");
  let reviewFilter = "all";
  let reviewQueue = [];
  let reviewIndex = 0;
  let draggedReviewKey = null;

  function reviewSort(entries) {
    const now = Date.now();
    return [...entries].sort((a, b) => {
      const aDue = a.srs.due <= now ? 0 : 1;
      const bDue = b.srs.due <= now ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      if ((a.srs.mastery || 0) !== (b.srs.mastery || 0)) return (a.srs.mastery || 0) - (b.srs.mastery || 0);
      return (a.srs.last || 0) - (b.srs.last || 0);
    });
  }

  function rebuildReviewQueue(filter = reviewFilter) {
    reviewFilter = filter;
    reviewQueue = reviewSort(learnedEntries(filter));
    reviewIndex = 0;
    $$("[data-review-filter]").forEach(button => button.classList.toggle("active", button.dataset.reviewFilter === reviewFilter));
    renderReviewWorkspace();
  }

  function openReview() {
    showDialog(reviewDialog);
    rebuildReviewQueue(reviewFilter);
  }

  function renderReviewWorkspace() {
    const hasItems = reviewQueue.length > 0;
    $("#reviewEmpty").classList.toggle("hidden", hasItems);
    $("#reviewWorkspace").classList.toggle("hidden", !hasItems);
    if (!hasItems) return;

    if (reviewIndex >= reviewQueue.length) {
      showToast("Full review complete.");
      closeDialog(reviewDialog);
      return;
    }

    renderReviewQueueList();
    renderReviewCard();
  }

  function renderReviewQueueList() {
    const remaining = reviewQueue.slice(reviewIndex);
    $("#reviewQueueCount").textContent = `${remaining.length} card${remaining.length === 1 ? "" : "s"} remaining`;
    $("#reviewQueueList").innerHTML = remaining.map((entry, offset) => {
      const absoluteIndex = reviewIndex + offset;
      const due = entry.srs.due <= Date.now();
      const lang = langFromKind(entry.kind);
      return `
        <button class="queue-card ${absoluteIndex === reviewIndex ? "active" : ""}" draggable="true" data-review-key="${escapeHtml(entry.key)}">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <span class="queue-lang">${lang === "jp" ? "日" : "粵"}</span>
          <span class="queue-copy">
            <strong>${escapeHtml(humanizedPattern(entry.kind, entry.item))}</strong>
            <small>${escapeHtml(itemLevel(entry.kind, entry.item))} · ${due ? "Due now" : `Mastery ${entry.srs.mastery || 0}%`}</small>
          </span>
        </button>`;
    }).join("");

    $$("#reviewQueueList .queue-card").forEach(card => {
      card.addEventListener("dragstart", event => {
        draggedReviewKey = card.dataset.reviewKey;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        draggedReviewKey = null;
        card.classList.remove("dragging");
        $$("#reviewQueueList .queue-card").forEach(item => item.classList.remove("drag-over"));
      });
      card.addEventListener("dragover", event => {
        event.preventDefault();
        card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", event => {
        event.preventDefault();
        card.classList.remove("drag-over");
        reorderReviewQueue(draggedReviewKey, card.dataset.reviewKey);
      });
      card.addEventListener("click", () => moveReviewCardToFront(card.dataset.reviewKey));
    });
  }

  function reorderReviewQueue(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const fromIndex = reviewQueue.findIndex(entry => entry.key === fromKey);
    const toIndex = reviewQueue.findIndex(entry => entry.key === toKey);
    if (fromIndex < reviewIndex || toIndex < reviewIndex || fromIndex < 0 || toIndex < 0) return;
    const [moved] = reviewQueue.splice(fromIndex, 1);
    reviewQueue.splice(toIndex, 0, moved);
    renderReviewWorkspace();
  }

  function moveReviewCardToFront(key) {
    const index = reviewQueue.findIndex(entry => entry.key === key);
    if (index <= reviewIndex) return;
    const [entry] = reviewQueue.splice(index, 1);
    reviewQueue.splice(reviewIndex, 0, entry);
    renderReviewWorkspace();
  }

  function renderReviewCard() {
    const entry = reviewQueue[reviewIndex];
    if (!entry) return;
    const due = entry.srs.due <= Date.now();
    const lang = langFromKind(entry.kind);
    const reading = humanizedReading(entry.kind, entry.item);
    const readingLabel = lang === "yue" ? "Jyutping" : "Reading";

    $("#reviewSessionCount").textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
    $("#reviewSessionDue").textContent = due ? "Due now" : `Mastery ${entry.srs.mastery || 0}%`;
    $("#reviewSideLabel").textContent = lang === "jp" ? "JAPANESE REVIEW" : "CANTONESE REVIEW";
    $("#reviewPrompt").textContent = humanizedPattern(entry.kind, entry.item);
    $("#reviewPromptSub").textContent = entry.kind.endsWith("P")
      ? "Recall the passage meaning and main ideas before revealing."
      : "Recall the meaning and usage before revealing.";
    $("#speakReview").disabled = !speechText(entry.kind, entry.item);
    $("#reviewReveal").classList.add("hidden");
    $("#reviewReveal").innerHTML = `
      ${lang !== "yue" && reading ? `<div class="review-reading-line"><span>${readingLabel}</span><p>${escapeHtml(reading)}</p></div>` : ""}
      <strong>${escapeHtml(meaningOf(entry.item))}</strong>
      ${entry.kind.endsWith("G") && grammarGuide(entry.item) ? `<p>${escapeHtml(grammarGuide(entry.item))}</p>` : ""}
      <small>${escapeHtml(displayMeta(entry.kind, entry.item))}</small>`;
    $("#reviewControls").innerHTML = '<button class="btn primary" id="revealReview">Reveal answer</button>';
    $("#revealReview").addEventListener("click", revealReview);
  }

  function revealReview() {
    const entry = reviewQueue[reviewIndex];
    if (entry && langFromKind(entry.kind) === "yue") {
      const reading = humanizedReading(entry.kind, entry.item);
      if (reading) $("#reviewPrompt").innerHTML = cantoneseRubyHtml(humanizedPattern(entry.kind, entry.item), reading);
    }
    $("#reviewReveal").classList.remove("hidden");
    $("#reviewControls").innerHTML = `
      <div class="review-rating-row">
        <button class="rating-btn again" data-review-rating="1">Again</button>
        <button class="rating-btn hard" data-review-rating="2">Hard</button>
        <button class="rating-btn good" data-review-rating="4">Good</button>
        <button class="rating-btn easy" data-review-rating="5">Easy</button>
      </div>`;
    $$("[data-review-rating]").forEach(button => {
      button.addEventListener("click", () => {
        const entry = reviewQueue[reviewIndex];
        schedule(entry.kind, entry.item, Number(button.dataset.reviewRating));
        reviewIndex += 1;
        saveState();
        renderReviewWorkspace();
      });
    });
  }

  // ---------- usage lab ----------

  const usageDialog = $("#usageLabDialog");
  let labMode = "ja";
  const usageExamples = {
    ja: {
      sentences: ["ashita tomodachi to eki de au", "ここに座ってもいいですか？", "雨が降っていたので、電車で会社に行きました。"],
      passages: ["先週、新しいアルバイトを始めました。仕事は少し忙しいですが、店の人たちは親切です。まだ覚えることがたくさんあるので、毎日メモを取りながら働いています。"]
    },
    yue: {
      sentences: ["我未做完功課，所以今晚唔出去。", "如果聽日落大雨，我哋就改喺屋企食飯。"],
      passages: ["有時候學語言最難唔係記生字，而係明明識個字，真正同人講嘢嗰陣又反應唔切。所以我而家會將新詞放落自己常用嘅句子入面，再隔幾日重新講一次。"]
    }
  };

  const structuralMarkers = new Set([
    "係", "喺", "嘅", "咗", "緊", "過", "唔", "冇", "未", "畀", "比", "就", "先", "都", "又", "仲", "呢", "嗰",
    "は", "が", "を", "に", "へ", "で", "と", "も", "の", "から", "まで", "より", "て", "ば", "なら", "ので", "のに"
  ]);

  const ROMAJI_TABLE = {
    kya:"きゃ",kyu:"きゅ",kyo:"きょ",gya:"ぎゃ",gyu:"ぎゅ",gyo:"ぎょ",
    sha:"しゃ",shu:"しゅ",sho:"しょ",sya:"しゃ",syu:"しゅ",syo:"しょ",
    ja:"じゃ",ju:"じゅ",jo:"じょ",jya:"じゃ",jyu:"じゅ",jyo:"じょ",
    cha:"ちゃ",chu:"ちゅ",cho:"ちょ",tya:"ちゃ",tyu:"ちゅ",tyo:"ちょ",
    nya:"にゃ",nyu:"にゅ",nyo:"にょ",hya:"ひゃ",hyu:"ひゅ",hyo:"ひょ",
    bya:"びゃ",byu:"びゅ",byo:"びょ",pya:"ぴゃ",pyu:"ぴゅ",pyo:"ぴょ",
    mya:"みゃ",myu:"みゅ",myo:"みょ",rya:"りゃ",ryu:"りゅ",ryo:"りょ",
    fa:"ふぁ",fi:"ふぃ",fe:"ふぇ",fo:"ふぉ",tsa:"つぁ",tsi:"つぃ",tse:"つぇ",tso:"つぉ",
    she:"しぇ",je:"じぇ",che:"ちぇ",ti:"てぃ",di:"でぃ",tu:"とぅ",du:"どぅ",
    shi:"し",chi:"ち",tsu:"つ",dzu:"づ",
    a:"あ",i:"い",u:"う",e:"え",o:"お",
    ka:"か",ki:"き",ku:"く",ke:"け",ko:"こ",ga:"が",gi:"ぎ",gu:"ぐ",ge:"げ",go:"ご",
    sa:"さ",si:"し",su:"す",se:"せ",so:"そ",za:"ざ",ji:"じ",zi:"じ",zu:"ず",ze:"ぜ",zo:"ぞ",
    ta:"た",te:"て",to:"と",da:"だ",de:"で",do:"ど",
    na:"な",ni:"に",nu:"ぬ",ne:"ね",no:"の",
    ha:"は",hi:"ひ",fu:"ふ",hu:"ふ",he:"へ",ho:"ほ",
    ba:"ば",bi:"び",bu:"ぶ",be:"べ",bo:"ぼ",pa:"ぱ",pi:"ぴ",pu:"ぷ",pe:"ぺ",po:"ぽ",
    ma:"ま",mi:"み",mu:"む",me:"め",mo:"も",ya:"や",yu:"ゆ",yo:"よ",
    ra:"ら",ri:"り",ru:"る",re:"れ",ro:"ろ",wa:"わ",wi:"うぃ",we:"うぇ",wo:"を"
  };

  function kataToHira(text) {
    return String(text || "").replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  function romajiWordToKana(word) {
    let input = normalize(word)
      .replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu").replace(/ē/g, "ee").replace(/ō/g, "ou")
      .replace(/[^a-z'-]/g, "");
    if (!input) return word;
    const standalone = { wa: "は", wo: "を", e: "へ" };
    if (standalone[input]) return standalone[input];
    let out = "";
    let i = 0;
    while (i < input.length) {
      if (input[i] === "-") { out += "ー"; i += 1; continue; }
      if (input[i] === "'") { i += 1; continue; }
      const next = input[i + 1] || "";
      if (i + 1 < input.length && input[i] === next && /[bcdfghjkmprstvwxyz]/.test(input[i]) && input[i] !== "n") {
        out += "っ"; i += 1; continue;
      }
      if (input[i] === "n" && (i === input.length - 1 || input[i + 1] === "'" || (!/[aeiouy]/.test(input[i + 1]) && input[i + 1] !== "n"))) {
        out += "ん"; i += input[i + 1] === "'" ? 2 : 1; continue;
      }
      let matched = false;
      for (const length of [3, 2, 1]) {
        const key = input.slice(i, i + length);
        if (ROMAJI_TABLE[key]) {
          out += ROMAJI_TABLE[key]; i += length; matched = true; break;
        }
      }
      if (!matched) { out += input[i]; i += 1; }
    }
    return out;
  }

  function prepareLabInput(text, mode) {
    const original = String(text || "").trim();
    if (mode !== "ja" || !/[A-Za-zāīūēō]/.test(original)) return { original, interpreted: original, converted: false };
    const interpreted = original
      .replace(/[A-Za-zāīūēōĀĪŪĒŌ'-]+/g, token => romajiWordToKana(token))
      .replace(/\s+/g, "")
      .trim();
    return { original, interpreted, converted: interpreted !== original };
  }

  function japaneseConjugationVariants(reading) {
    const base = kataToHira(String(reading || "").trim());
    const variants = new Set([base]);
    if (!base) return [...variants];
    if (base.endsWith("する")) {
      const stem = base.slice(0, -2); ["します","した","して","しない","しません","すれば","しよう"].forEach(end => variants.add(stem + end));
      return [...variants];
    }
    if (base.endsWith("くる")) {
      const stem = base.slice(0, -2); ["きます","きた","きて","こない","きません","くれば","こよう"].forEach(end => variants.add(stem + end));
      return [...variants];
    }
    const ending = base.slice(-1);
    const stem = base.slice(0, -1);
    const map = {
      "う":["います","った","って","わない"], "く":["きます","いた","いて","かない"], "ぐ":["ぎます","いだ","いで","がない"],
      "す":["します","した","して","さない"], "つ":["ちます","った","って","たない"], "ぬ":["にます","んだ","んで","なない"],
      "ぶ":["びます","んだ","んで","ばない"], "む":["みます","んだ","んで","まない"]
    };
    if (ending === "る") {
      const previous = base.slice(-2, -1);
      if (/[いきしちにひみりえけせてねへめれげぜでべぺ]/.test(previous)) ["ます","ました","ない","なかった","て","た","れば","よう"].forEach(end => variants.add(stem + end));
      else ["ります","った","って","らない","れば","ろう"].forEach(end => variants.add(stem + end));
    } else if (map[ending]) map[ending].forEach(end => variants.add(stem + end));
    if (base === "いく") ["いった","いって"].forEach(value => variants.add(value));
    return [...variants];
  }

  const lexiconTries = {};
  function addTrieSurface(root, surface, candidate) {
    const normalizedSurface = kataToHira(String(surface || "").normalize("NFKC").trim());
    if (!normalizedSurface || normalizedSurface.length > 32) return;
    let node = root;
    for (const char of normalizedSurface) {
      node.next[char] ||= { next: Object.create(null), candidates: [] };
      node = node.next[char];
    }
    if (!node.candidates.some(existing => existing.item === candidate.item && existing.variant === candidate.variant)) node.candidates.push(candidate);
  }

  function buildLexiconTrie(mode) {
    if (lexiconTries[mode]) return lexiconTries[mode];
    const root = { next: Object.create(null), candidates: [] };
    const items = mode === "yue" ? source.yueV : source.jpV;
    items.forEach(item => {
      if (mode === "yue") {
        addTrieSurface(root, item.word, { item, variant: "expression", surface: item.word });
      } else {
        addTrieSurface(root, item.expression, { item, variant: "expression", surface: item.expression });
        addTrieSurface(root, item.reading, { item, variant: "reading", surface: item.reading });
        japaneseConjugationVariants(item.reading).forEach(surface => addTrieSurface(root, surface, { item, variant: surface === kataToHira(item.reading) ? "reading" : "conjugated", surface }));
      }
    });
    const pseudo = mode === "ja"
      ? {
          "は":"topic marker", "が":"subject/focus marker", "を":"direct-object marker", "に":"time/destination/target marker", "へ":"direction marker", "で":"location/means marker", "と":"with/quotation marker", "も":"also/even", "の":"possession/modification marker", "から":"from/because", "まで":"until/to", "より":"than/from"
        }
      : { "嘅":"modifier/possessive particle", "咗":"perfective/change marker", "緊":"ongoing aspect", "過":"experiential aspect", "唔":"negation", "冇":"not have / did not", "未":"not yet" };
    Object.entries(pseudo).forEach(([surface, meaning]) => addTrieSurface(root, surface, { item: { id:`marker-${surface}`, expression:surface, word:surface, reading:surface, jyutping:"", meaning, _structural:true }, variant:"structural", surface }));
    lexiconTries[mode] = root;
    return root;
  }

  function wordTypeHeuristic(item, mode) {
    if (item?._structural) return "particle";
    const meaning = normalize(item?.meaning || "");
    const surface = mode === "ja" ? String(item?.reading || item?.expression || "") : String(item?.word || "");
    if (/^(to |be |do |go |come |eat |drink |make |use |say |speak |see |look |think |know |have )/.test(meaning)) return "verb";
    if (mode === "ja" && /[うくぐすつぬぶむる]$/.test(surface) && !/^(day|night|spring|summer|autumn|winter)/.test(meaning)) return "verb";
    if (/adjective|; adj|\bvery\b|beautiful|good|bad|big|small|new|old|easy|difficult/.test(meaning)) return "adjective";
    return "noun";
  }

  const senseContextCache = new Map();

  function characterNgrams(text, size = 2) {
    const clean = String(text || "").normalize("NFKC").replace(/[\s。！？!?、，,.；;：「」『』（）()\[\]]/g, "");
    const chars = [...clean];
    const grams = new Set();
    for (let i = 0; i <= chars.length - size; i += 1) grams.add(chars.slice(i, i + size).join(""));
    return grams;
  }

  function candidateContextOverlap(item, text, mode) {
    if (!item || item._structural) return 0;
    const kind = mode === "yue" ? "yueV" : "jpV";
    const cacheKey = `${kind}:${item.id}`;
    let contextGrams = senseContextCache.get(cacheKey);
    if (!contextGrams) {
      contextGrams = new Set();
      authenticContexts(kind, item).slice(0, 5).forEach(example => {
        const target = mode === "yue" ? item.word : item.expression;
        const contextText = String(example.text || "").replaceAll(target || "", "");
        characterNgrams(mode === "ja" ? kataToHira(contextText) : contextText, 2).forEach(gram => contextGrams.add(gram));
      });
      senseContextCache.set(cacheKey, contextGrams);
    }
    if (!contextGrams.size) return 0;
    const inputGrams = characterNgrams(mode === "ja" ? kataToHira(text) : text, 2);
    let overlap = 0;
    inputGrams.forEach(gram => { if (contextGrams.has(gram)) overlap += 1; });
    return Math.min(18, overlap * 3);
  }

  function candidateSenseScore(candidate, surface, text, start, end, mode) {
    const item = candidate.item;
    let score = 0;
    if (candidate.variant === "expression") score += 24;
    if (candidate.variant === "reading") score += 18;
    if (candidate.variant === "conjugated") score += 22;
    if (candidate.variant === "structural") score += 45;
    if (mode === "yue") score += Math.max(0, 20 - Math.log10(Number(item.frequency_rank) || 100000) * 4);
    else {
      const levelWeight = { N5: 12, N4: 10, N3: 8, N2: 6, N1: 4 };
      score += levelWeight[item.level] || 2;
    }
    const type = wordTypeHeuristic(item, mode);
    const next = text.slice(end, end + 2);
    const prev = text.slice(Math.max(0, start - 2), start);
    if (mode === "ja") {
      if (/^[をはがのも]/.test(next) && type === "noun") score += 10;
      if (/^[にへでとからまで]/.test(next) && type === "noun") score += 5;
      if (/[をにへで]$/.test(prev) && type === "verb") score += 10;
      if (/^(する|した|して|します)/.test(next) && type === "noun") score += 8;
      if (/^(ない|なかった|ます|ました|て|た)/.test(next) && type === "verb") score += 7;
    } else {
      if (/^[嘅]/.test(next) && type === "noun") score += 7;
      if (/^[咗緊過]/.test(next) && type === "verb") score += 10;
      if (/[我你佢]$/.test(prev) && type === "verb") score += 4;
      if (/^[個本件隻杯張條位]/.test(next) && type === "noun") score += 5;
      // Do not let a longer statement-only lexical chunk swallow a genuine final
      // question particle. Example: 點解你冇嚟嘅？ should keep 嚟 + 嘅, not force 嚟嘅.
      const after = text.slice(end, end + 1);
      const surfaceText = text.slice(start, end);
      if (/[？?]/.test(after) && surfaceText.length > 1 && surfaceText.endsWith("嘅") && /statement|strengthen|assert/i.test(String(item.meaning || ""))) score -= 180;
    }
    score += candidateContextOverlap(item, text, mode);
    return score;
  }

  function rankCandidates(candidates, surface, text, start, end, mode) {
    const deduped = [];
    const seen = new Set();
    candidates.forEach(candidate => {
      const key = candidate.item.id || `${candidate.item.word || candidate.item.expression}:${candidate.item.meaning}`;
      if (seen.has(key)) return;
      seen.add(key); deduped.push(candidate);
    });
    return deduped
      .map(candidate => ({ ...candidate, senseScore: candidateSenseScore(candidate, surface, text, start, end, mode) }))
      .sort((a, b) => b.senseScore - a.senseScore);
  }

  const SEMANTIC_DOMAIN_RULES = {
    food: /eat|food|meal|rice|chopstick|restaurant|cook|cooking|drink|tea|coffee|dish|kitchen|taste|breakfast|lunch|dinner|餸|食|飯|茶/i,
    movement: /go|come|walk|cross|bridge|river|road|train|bus|station|travel|car|street|move|return|arrive|leave|橋|川|河|渡|車|駅/i,
    people: /person|people|friend|family|mother|father|sister|brother|teacher|student|child|man|woman|人|友|母|父|先生|学生/i,
    time: /time|day|week|month|year|today|tomorrow|yesterday|morning|night|hour|minute|時|日|週|月|年/i,
    work: /work|job|company|office|school|study|learn|class|homework|meeting|会社|仕事|学校|勉強/i,
    body: /body|health|sick|pain|head|hand|foot|eye|ear|medicine|doctor|病|医|手|足|目|耳/i,
    money: /money|buy|sell|price|shop|store|expensive|cheap|pay|cost|円|買|売|店|値/i,
    communication: /say|speak|talk|ask|answer|language|word|sentence|read|write|listen|hear|話|言|聞|読|書|語/i,
    home: /home|house|room|door|table|chair|bed|家|屋|部屋|門/i,
    nature: /weather|rain|snow|wind|sea|mountain|tree|flower|sky|雨|雪|風|海|山|木|花/i
  };

  function semanticDomainsForItem(item) {
    if (!item || item._structural) return new Set();
    const haystack = `${item.meaning || ""} ${item.expression || ""} ${item.word || ""}`;
    return new Set(Object.entries(SEMANTIC_DOMAIN_RULES).filter(([, rx]) => rx.test(haystack)).map(([domain]) => domain));
  }

  function rerankSegmentedSenses(tokens) {
    tokens.forEach((token, index) => {
      if (!token.known || token.item?._structural || !token.alternatives?.length) return;
      const candidates = [token.item, ...token.alternatives];
      const neighborDomains = new Set();
      for (let j = Math.max(0, index - 4); j <= Math.min(tokens.length - 1, index + 4); j += 1) {
        if (j === index || !tokens[j].known) continue;
        semanticDomainsForItem(tokens[j].item).forEach(domain => neighborDomains.add(domain));
      }
      if (!neighborDomains.size) return;
      const scored = candidates.map((item, originalIndex) => {
        const domains = semanticDomainsForItem(item);
        let overlap = 0;
        domains.forEach(domain => { if (neighborDomains.has(domain)) overlap += 1; });
        // Keep the first-pass contextual rank as the tie-breaker, but allow strong
        // semantic agreement with nearby recognized words to resolve homophones.
        return { item, score: overlap * 40 - originalIndex * 0.01 };
      }).sort((a, b) => b.score - a.score);
      if (scored[0].score > 0 && scored[0].item !== token.item) {
        token.item = scored[0].item;
        token.alternatives = scored.slice(1).map(entry => entry.item).slice(0, 4);
      }
    });
    return tokens;
  }

  function segmentText(text, mode) {
    const prepared = mode === "ja" ? kataToHira(String(text || "").normalize("NFKC")) : String(text || "").normalize("NFKC");
    const trie = buildLexiconTrie(mode);
    const n = prepared.length;
    const dp = new Array(n + 1);
    dp[n] = { score: 0, token: null, next: n };
    const punctuationRx = /[。！？!?、，,.；;：「」『』（）()\[\]…]/;
    for (let i = n - 1; i >= 0; i -= 1) {
      const ch = prepared[i];
      if (/\s/.test(ch)) { dp[i] = { score: dp[i + 1]?.score ?? -Infinity, token: null, next: i + 1 }; continue; }
      if (punctuationRx.test(ch)) { dp[i] = { score: (dp[i + 1]?.score ?? 0) + 1, token: { text: ch, punctuation: true }, next: i + 1 }; continue; }
      let best = { score: (dp[i + 1]?.score ?? -Infinity) - 12, token: { text: ch, known: false }, next: i + 1 };
      let node = trie;
      for (let j = i; j < Math.min(n, i + 32) && node.next[prepared[j]]; j += 1) {
        node = node.next[prepared[j]];
        if (!node.candidates.length) continue;
        const end = j + 1;
        const surface = prepared.slice(i, end);
        const ranked = rankCandidates(node.candidates, surface, prepared, i, end, mode);
        if (!ranked.length) continue;
        const length = [...surface].length;
        // Strongly super-additive length reward prevents a known multi-character word from
        // being fragmented into several individually common one-character entries.
        const tokenScore = length * length * 48 + length * 5 + ranked[0].senseScore;
        const total = tokenScore + (dp[end]?.score ?? 0);
        if (total > best.score) {
          best = {
            score: total,
            token: { text: surface, known: true, item: ranked[0].item, variant: ranked[0].variant, alternatives: ranked.slice(1, 5).map(candidate => candidate.item) },
            next: end
          };
        }
      }
      dp[i] = best;
    }
    const tokens = [];
    let i = 0;
    while (i < n) {
      const step = dp[i];
      if (!step) break;
      if (step.token) {
        const previous = tokens[tokens.length - 1];
        if (!step.token.known && !step.token.punctuation && previous && !previous.known && !previous.punctuation) previous.text += step.token.text;
        else tokens.push(step.token);
      }
      i = Math.max(i + 1, step.next);
    }
    return rerankSegmentedSenses(tokens);
  }

  function scriptChunks(pattern, mode) {
    const rx = mode === "yue" ? /[\u3400-\u9fff]+/g : /[\u3040-\u30ff\u3400-\u9fff]+/g;
    return String(pattern || "").match(rx) || [];
  }

  const SHORT_EMBEDDED_JP_GRAMMAR = new Set(["たい", "ない", "そう", "よう", "らしい", "べき", "はず", "わけ", "ので", "のに", "なら", "たら", "ても"]);

  function templateStructureMatches(item, tokens, mode, marker) {
    const pattern = String(item.pattern || "").toUpperCase();
    const index = tokens.findIndex(token => token.text === marker);
    if (index < 0) return false;
    const previous = [...tokens.slice(0, index)].reverse().find(token => token.known && !token.punctuation);
    const next = tokens.slice(index + 1).find(token => token.known && !token.punctuation);
    if (mode === "yue") {
      const pronouns = new Set(["我", "你", "佢", "我哋", "你哋", "佢哋"]);
      const markerPos = pattern.indexOf(marker.toUpperCase());
      const nounPos = pattern.search(/NOUN|\bN\b/);
      const verbPos = pattern.search(/VERB|\bV\b/);
      if (/ADJ/.test(pattern) && (!previous || wordTypeHeuristic(previous.item, mode) !== "adjective")) return false;
      if (/PRONOUN/.test(pattern) && (!previous || !pronouns.has(previous.text))) return false;
      if (nounPos >= 0 && markerPos >= 0 && markerPos < nounPos && (!next || wordTypeHeuristic(next.item, mode) !== "noun")) return false;
      if (verbPos >= 0 && markerPos >= 0 && markerPos < verbPos && (!next || wordTypeHeuristic(next.item, mode) !== "verb")) return false;
      return Boolean(previous || next);
    }
    return false;
  }

  function grammarChunkPresent(chunk, sentence, mode, tokens) {
    const normalizedChunk = mode === "ja" ? kataToHira(chunk) : chunk;
    const tokenSurfaces = new Set(tokens.filter(token => !token.punctuation).map(token => token.text));
    if (normalizedChunk.length === 1 && structuralMarkers.has(normalizedChunk)) return tokenSurfaces.has(normalizedChunk);
    if (tokenSurfaces.has(normalizedChunk)) return true;
    if (mode === "ja" && normalizedChunk.length <= 3 && /^[ぁ-ゖ]+$/.test(normalizedChunk)) {
      if (SHORT_EMBEDDED_JP_GRAMMAR.has(normalizedChunk)) return tokens.some(token => token.text.endsWith(normalizedChunk));
      return false;
    }
    return sentence.includes(normalizedChunk) || sentence.includes(chunk);
  }

  function matchGrammar(sentence, mode, tokens = []) {
    const items = mode === "yue" ? source.yueG : source.jpG;
    const hits = [];
    for (const item of items) {
      const chunks = scriptChunks(item.pattern, mode);
      if (!chunks.length) continue;
      const matched = chunks.filter(chunk => grammarChunkPresent(chunk, sentence, mode, tokens));
      if (!matched.length) continue;
      const strongest = Math.max(...matched.map(chunk => chunk.length));
      const coverage = matched.length / chunks.length;
      const templateHasSlots = /\b(?:ADJ|NOUN|VERB|PRONOUN|CLAUSE|SUBJECT|OBJECT|PLACE|TIME|PERSON|PHRASE|VP|NP|RELATIVE)\b/i.test(String(item.pattern || ""));
      // A lone particle should not make a larger template look like a match.
      if (strongest < 2) {
        const singleMarker = chunks.length === 1 && matched.some(chunk => structuralMarkers.has(chunk));
        if (!singleMarker) continue;
        if (templateHasSlots && !templateStructureMatches(item, tokens, mode, matched[0])) continue;
      }
      // Multi-part constructions need meaningful coverage, not one incidental fragment.
      if (chunks.length > 1 && coverage < 0.5 && strongest < 3) continue;
      const specificity = matched.reduce((sum, chunk) => sum + Math.min(6, chunk.length), 0);
      hits.push({ item, score: coverage * 100 + specificity });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function vocabItemFields(item, mode) {
    return mode === "yue"
      ? { word: item.word, reading: item.jyutping, meaning: item.meaning }
      : { word: item.expression, reading: item.reading, meaning: item.meaning };
  }

  function uniqueKnownVocab(tokens, mode) {
    const seen = new Set();
    return tokens.filter(token => token.known && token.item && !token.item._structural).map(token => token.item).filter(item => {
      const key = vocabItemFields(item, mode).word;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function structureHints(tokens, mode) {
    const joined = tokens.map(token => token.text).join("");
    const tokenSurfaces = new Set(tokens.filter(token => !token.punctuation).map(token => token.text));
    const hasMarker = marker => marker.length === 1 ? tokenSurfaces.has(marker) : joined.includes(marker);
    const hints = [];
    if (mode === "ja") {
      const markers = { "は":"topic marker", "が":"subject/focus marker", "を":"direct-object marker", "に":"time, destination, or target marker", "へ":"direction marker", "で":"location of an action or means", "と":"quotation/with marker", "も":"also/even", "の":"possession or noun-linking marker", "から":"from / because", "まで":"until / as far as", "ので":"because / since", "のに":"although / despite" };
      Object.entries(markers).forEach(([marker, explanation]) => { if (hasMarker(marker)) hints.push({ label: marker, explanation }); });
      if (/です|ます|ました|ません/.test(joined)) hints.push({ label: "Polite predicate", explanation: "A です/ます-family ending indicates polite speech." });
      if (/ている|ています/.test(joined)) hints.push({ label: "Ongoing/state", explanation: "〜ている commonly marks an ongoing action or resulting state." });
    } else {
      const markers = { "係":"copula — links a person or thing to an identity/category", "喺":"location marker/verb", "唔":"general negation", "冇":"negative of 有 and common completed-event negation", "未":"not yet", "咗":"perfective/change marker", "緊":"ongoing/progressive aspect", "過":"experiential aspect", "嘅":"modifier/possessor linker", "畀":"recipient/passive marker", "如果":"if-clause opener", "就":"result/consequence marker", "所以":"therefore / so", "雖然":"although", "但係":"but" };
      Object.entries(markers).forEach(([marker, explanation]) => { if (hasMarker(marker)) hints.push({ label: marker, explanation }); });
      if (/^[我你佢我哋你哋佢哋]/.test(joined)) hints.unshift({ label: "Likely topic/subject", explanation: `The sentence begins with ${joined[0]}, a common pronoun occupying the topic/subject position.` });
      if (/[呀啦喇喎啫㗎嘛呢]$/.test(joined)) hints.push({ label: "Sentence-final particle", explanation: "The final particle adds conversational stance or tone rather than dictionary meaning alone." });
    }
    return hints.slice(0, 10);
  }

  function registerInference(sentence, mode, grammarHits) {
    if (mode === "ja") {
      if (/です|ます|ください|ません|でしょう|いただ/.test(sentence)) return { label: "Polite/formal markers detected", score: 90 };
      if (/[だよねなぞぜ]$/.test(sentence)) return { label: "Likely casual or neutral conversational style", score: 72 };
      return { label: "Register is ambiguous without more context", score: 55 };
    }
    const registers = grammarHits.map(hit => hit.item.register).filter(value => value && value !== "varies");
    if (registers.length) return { label: `Matched grammar register: ${[...new Set(registers)].map(titleCase).join(", ")}`, score: 82 };
    if (/[呀啦喇喎啫㗎嘛呢]$/.test(sentence)) return { label: "Conversational sentence-final particle detected", score: 84 };
    return { label: "Register is ambiguous without relationship context", score: 55 };
  }

  function splitIntoSentences(text) {
    return (text.match(/[^。！？!?\n]+[。！？!?]?/g) || []).map(sentence => sentence.trim()).filter(Boolean);
  }

  function analyzeSentence(sentence, mode) {
    const tokens = segmentText(sentence, mode);
    const grammarHits = matchGrammar(sentence, mode, tokens);
    const vocabHits = uniqueKnownVocab(tokens, mode);
    const hints = structureHints(tokens, mode);
    const register = registerInference(sentence, mode, grammarHits);
    const targetChars = [...sentence].filter(char => /[\u3040-\u30ff\u3400-\u9fff]/.test(char)).length || 1;
    const knownChars = tokens.filter(token => token.known).reduce((sum, token) => sum + [...token.text].length, 0);
    return { sentence, tokens, grammarHits, vocabHits, hints, register, coverage: clamp(Math.round(knownChars / targetChars * 100), 0, 100) };
  }

  function renderToken(token, mode) {
    if (token.punctuation) return `<span class="seg-token punctuation">${escapeHtml(token.text)}</span>`;
    if (!token.known || !token.item) return `<span class="seg-token unknown" title="Not confidently matched to the bundled lexicon">${escapeHtml(token.text)}</span>`;
    const fields = vocabItemFields(token.item, mode);
    const canonical = fields.word && fields.word !== token.text ? fields.word : "";
    const title = [fields.reading, fields.meaning].filter(Boolean).join(" · ");
    return `<span class="seg-token known" title="${escapeHtml(title)}"><b>${escapeHtml(token.text)}</b>${canonical ? `<small>${escapeHtml(canonical)}</small>` : fields.reading ? `<small>${escapeHtml(fields.reading)}</small>` : ""}${token.alternatives?.length ? `<em>+${token.alternatives.length}</em>` : ""}</span>`;
  }

  function renderContextChoices(tokens, mode) {
    const meaningful = tokens.filter(token => token.known && token.item && !token.item._structural);
    if (!meaningful.length) return '<div class="analysis-match muted-match">No confident lexical candidates.</div>';
    return meaningful.map(token => {
      const primary = vocabItemFields(token.item, mode);
      const alternatives = (token.alternatives || []).map(item => vocabItemFields(item, mode));
      return `<div class="sense-choice">
        <div><b>${escapeHtml(token.text)}</b><span>Best context match</span></div>
        <p><strong>${escapeHtml(primary.word)}</strong>${primary.reading ? ` · ${escapeHtml(primary.reading)}` : ""} — ${escapeHtml(primary.meaning || "")}</p>
        ${alternatives.length ? `<details><summary>${alternatives.length} alternative ${alternatives.length === 1 ? "sense" : "senses"}</summary>${alternatives.map(alt => `<p>${escapeHtml(alt.word)}${alt.reading ? ` · ${escapeHtml(alt.reading)}` : ""} — ${escapeHtml(alt.meaning || "")}</p>`).join("")}</details>` : ""}
      </div>`;
    }).join("");
  }

  function renderUsageExamples() {
    const group = usageExamples[labMode];
    $("#usageExamples").innerHTML = `
      <div class="example-group"><small>Sentences</small>${group.sentences.map(example => `<button data-usage-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}</div>
      <div class="example-group"><small>Passage</small>${group.passages.map(example => `<button data-usage-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}</div>`;
    $$('[data-usage-example]').forEach(button => button.addEventListener("click", () => {
      $("#usageInput").value = button.dataset.usageExample;
      $("#usageInput").dispatchEvent(new Event("input"));
      analyzeUsage();
    }));
  }

  function setLabMode(mode) {
    labMode = mode === "yue" ? "yue" : "ja";
    $$('[data-lab]').forEach(button => button.classList.toggle("active", button.dataset.lab === labMode));
    $("#usageInput").placeholder = labMode === "ja" ? "日本語、romaji、文・段落を入力…" : "輸入廣東話句子或段落…";
    $("#usageInput").value = "";
    $("#charCount").textContent = "0/2000";
    $("#labAnalysis").innerHTML = '<div class="analysis-empty">Paste a sentence or passage. Japanese romaji is converted to kana first; then AIDA uses global segmentation, candidate ranking, structure markers, and local grammar evidence.</div>';
    $$(".verify-check").forEach(node => { node.textContent = "—"; });
    renderUsageExamples();
  }

  function analyzeUsage() {
    const raw = $("#usageInput").value.trim();
    if (!raw) { showToast("Type or paste a sentence or passage first."); return; }
    const prepared = prepareLabInput(raw, labMode);
    const sentences = splitIntoSentences(prepared.interpreted);
    const analyses = sentences.map(sentence => analyzeSentence(sentence, labMode));
    const grammarCount = analyses.reduce((sum, analysis) => sum + analysis.grammarHits.length, 0);
    const averageCoverage = analyses.length ? Math.round(analyses.reduce((sum, analysis) => sum + analysis.coverage, 0) / analyses.length) : 0;
    const averageRegister = analyses.length ? Math.round(analyses.reduce((sum, analysis) => sum + analysis.register.score, 0) / analyses.length) : 0;
    const grammarScore = clamp(30 + grammarCount * 8, 30, 100);
    [grammarScore, averageCoverage, averageRegister].forEach((score, index) => { $$(".verify-check")[index].textContent = `${score}%`; });

    const grammarKind = labMode === "ja" ? "jpG" : "yueG";
    const sentenceHtml = analyses.map((analysis, index) => {
      const grammarHtml = analysis.grammarHits.length
        ? analysis.grammarHits.slice(0, 5).map(({ item }) => `<div class="analysis-match"><b>${escapeHtml(humanizedPattern(grammarKind, item))}</b><span>${escapeHtml(item.meaning)}</span></div>`).join("")
        : '<div class="analysis-match muted-match">No confident bundled grammar match for this sentence.</div>';
      const structureHtml = analysis.hints.length
        ? analysis.hints.map(hint => `<div class="structure-hint"><b>${escapeHtml(hint.label)}</b><span>${escapeHtml(hint.explanation)}</span></div>`).join("")
        : '<div class="analysis-match muted-match">No basic structure marker was confidently identified.</div>';
      return `
        <article class="sentence-analysis" id="analysisSentence-${index}">
          <div class="sentence-analysis-head"><span>Sentence ${index + 1}</span><strong>${analysis.coverage}% vocabulary coverage</strong></div>
          <p class="analyzed-sentence">${escapeHtml(analysis.sentence)}</p>
          <div class="analysis-subsection"><h5>Word separation</h5><div class="segmented-line">${analysis.tokens.map(token => renderToken(token, labMode)).join("")}</div></div>
          <div class="analysis-subsection"><h5>Contextual word choices</h5><div class="sense-choice-list">${renderContextChoices(analysis.tokens, labMode)}</div></div>
          <div class="analysis-subsection"><h5>Basic structure</h5><div class="structure-grid">${structureHtml}</div></div>
          <div class="analysis-subsection"><h5>Grammar matches</h5>${grammarHtml}</div>
          <div class="analysis-subsection"><h5>Register</h5><div class="analysis-match"><span>${escapeHtml(analysis.register.label)}</span></div></div>
        </article>`;
    }).join("");

    $("#labAnalysis").innerHTML = `
      ${prepared.converted ? `<div class="interpreted-input"><span>Interpreted romaji as</span><strong>${escapeHtml(prepared.interpreted)}</strong><small>Original: ${escapeHtml(prepared.original)}</small></div>` : ""}
      <div class="analysis-overview">
        <div><strong>${sentences.length}</strong><span>${sentences.length === 1 ? "sentence" : "sentences"}</span></div>
        <div><strong>${grammarCount}</strong><span>grammar matches</span></div>
        <div><strong>${averageCoverage}%</strong><span>known-word coverage</span></div>
      </div>
      ${sentences.length > 1 ? `<div class="sentence-jump-nav"><span>Jump to</span>${sentences.map((_, index) => `<button data-jump-sentence="${index}">${index + 1}</button>`).join("")}</div><div class="passage-note">Passage mode: each sentence is segmented independently so one sentence cannot distort the next.</div>` : ""}
      ${sentenceHtml}`;

    $$('[data-jump-sentence]', $("#labAnalysis")).forEach(button => button.addEventListener("click", () => {
      const target = $(`#analysisSentence-${button.dataset.jumpSentence}`, $("#labAnalysis"));
      if (target) $("#labAnalysis").scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: "smooth" });
    }));
  }

  // ---------- context browser ----------

  const contextBrowserDialog = $("#contextBrowserDialog");
  let contextBrowserLang = "jp";
  let contextBrowserSelectedKey = "";
  let contextSearchTimer;

  function contextBrowserEntries(lang = contextBrowserLang) {
    const kinds = lang === "yue" ? ["yueV", "yueG"] : ["jpV", "jpG"];
    return kinds.flatMap(kind => source[kind].map(item => ({ kind, item })));
  }

  function contextBrowserSearchText(entry) {
    const { kind, item } = entry;
    return normalize([
      humanizedPattern(kind, item),
      humanizedReading(kind, item),
      meaningOf(item),
      itemLevel(kind, item),
      itemCategory(kind, item)
    ].filter(Boolean).join(" "));
  }

  function populateContextBrowserLevels() {
    const levels = contextBrowserLang === "jp" ? JP_LEVELS : YUE_LEVELS;
    const current = $("#contextLevelFilter").value;
    $("#contextLevelFilter").innerHTML = '<option value="all">All levels</option>' + levels
      .map(level => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join("");
    $("#contextLevelFilter").value = levels.includes(current) ? current : "all";
  }

  function contextTypeMatches(kind, type) {
    if (type === "vocab") return kind.endsWith("V");
    if (type === "grammar") return kind.endsWith("G");
    return true;
  }

  function renderContextBrowserResults(preferredKey = contextBrowserSelectedKey) {
    const query = normalize($("#contextSearchInput").value.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    const level = $("#contextLevelFilter").value;
    const type = $("#contextTypeFilter").value;
    let matches = contextBrowserEntries().filter(entry => {
      if (level !== "all" && itemLevel(entry.kind, entry.item) !== level) return false;
      if (!contextTypeMatches(entry.kind, type)) return false;
      if (!terms.length) return true;
      const haystack = contextBrowserSearchText(entry);
      return terms.every(term => haystack.includes(term));
    });
    matches = progressiveOrder(matches).slice(0, 80);

    if (!matches.some(entry => itemKey(entry.kind, entry.item) === preferredKey)) {
      contextBrowserSelectedKey = matches[0] ? itemKey(matches[0].kind, matches[0].item) : "";
    } else contextBrowserSelectedKey = preferredKey;

    $("#contextBrowserResults").innerHTML = matches.length
      ? `<div class="context-result-count">${matches.length}${matches.length === 80 ? "+" : ""} matching items</div>` + matches.map(entry => {
          const key = itemKey(entry.kind, entry.item);
          const selected = key === contextBrowserSelectedKey;
          return `<button class="context-result-item ${selected ? "active" : ""}" data-context-result-key="${escapeHtml(key)}">
            <span class="context-result-kind">${entry.kind.endsWith("V") ? "VOCAB" : "GRAMMAR"} · ${escapeHtml(itemLevel(entry.kind, entry.item))}</span>
            <strong>${escapeHtml(humanizedPattern(entry.kind, entry.item))}</strong>
            ${humanizedReading(entry.kind, entry.item) ? `<small>${escapeHtml(humanizedReading(entry.kind, entry.item))}</small>` : ""}
            <em>${escapeHtml(meaningOf(entry.item))}</em>
          </button>`;
        }).join("")
      : '<div class="context-browser-empty compact">No matching vocabulary or grammar point.</div>';

    $$("[data-context-result-key]", $("#contextBrowserResults")).forEach(button => {
      button.addEventListener("click", () => {
        contextBrowserSelectedKey = button.dataset.contextResultKey;
        renderContextBrowserResults(contextBrowserSelectedKey);
        renderContextBrowserDetail(byId.get(contextBrowserSelectedKey));
      });
    });

    renderContextBrowserDetail(byId.get(contextBrowserSelectedKey));
  }

  function renderContextQuestion(question, index) {
    return `<div class="context-review-question">
      <span>${escapeHtml(question.type || `Question ${index + 1}`)}</span>
      <p>${escapeHtml(question.question || question.prompt || "Comprehension question")}</p>
      <details><summary>Show reference answer</summary><div>${escapeHtml(question.answer || "")}</div></details>
    </div>`;
  }

  function directReadingBankMatches(entry) {
    if (!entry?.kind?.endsWith("V")) return [];
    const lang = langFromKind(entry.kind);
    const surface = entry.kind === "jpV" ? String(entry.item.expression || "").trim() : String(entry.item.word || "").trim();
    if (!surface) return [];
    const sentenceKind = lang === "jp" ? "jpS" : "yueS";
    const passageKind = lang === "jp" ? "jpP" : "yueP";
    return [
      ...source[sentenceKind].filter(item => String(item.text || "").includes(surface)).map(item => ({ kind: sentenceKind, item })),
      ...source[passageKind].filter(item => String(item.text || "").includes(surface)).map(item => ({ kind: passageKind, item }))
    ].slice(0, 10);
  }

  function renderDirectReadingMatch(match, lang) {
    const reading = humanizedReading(match.kind, match.item);
    const target = lang === "yue" && reading
      ? cantoneseRubyHtml(match.item.text || "", reading)
      : escapeHtml(match.item.text || "");
    return `<article class="direct-reading-match">
      <span>${match.kind.endsWith("P") ? "PASSAGE BANK" : "SENTENCE BANK"} · ${escapeHtml(itemLevel(match.kind, match.item))}</span>
      <p class="${lang === "yue" ? "canto-ruby" : ""}">${target}</p>
      ${lang !== "yue" && reading ? `<small>${escapeHtml(reading)}</small>` : ""}
      <details><summary>Show meaning${match.item.questions?.length ? " & questions" : ""}</summary>
        <div class="direct-reading-reveal"><p>${escapeHtml(meaningOf(match.item))}</p>${(match.item.questions || []).map(renderContextQuestion).join("")}</div>
      </details>
    </article>`;
  }

  function renderContextBrowserDetail(entry) {
    const host = $("#contextBrowserDetail");
    if (!entry) {
      host.innerHTML = '<div class="context-browser-empty">Search for a word or choose an item to review its sentence and passage variations.</div>';
      return;
    }
    const { kind, item } = entry;
    const lang = langFromKind(kind);
    const reading = humanizedReading(kind, item);
    const termHtml = lang === "yue" && reading
      ? cantoneseRubyHtml(humanizedPattern(kind, item), reading)
      : escapeHtml(humanizedPattern(kind, item));
    const sentences = contextVariations(kind, item);
    const passages = [0, 1, 2].map(index => contextPassageEntry(entry, index).item);
    const directMatches = directReadingBankMatches(entry);

    host.innerHTML = `
      <div class="context-detail-head">
        <div>
          <span class="modal-kicker">${kind.endsWith("V") ? "VOCABULARY" : "GRAMMAR"} · ${escapeHtml(itemLevel(kind, item))}</span>
          <h3 class="${lang === "yue" ? "canto-ruby" : ""}">${termHtml}</h3>
          ${lang !== "yue" && reading ? `<p class="context-detail-reading">${escapeHtml(reading)}</p>` : ""}
          <p class="context-detail-meaning">${escapeHtml(meaningOf(item))}</p>
        </div>
        <button class="btn secondary compact-btn" data-context-open-library="${escapeHtml(kind)}">Open in library</button>
      </div>

      <section class="context-review-section">
        <div class="context-review-section-head"><div><span>01</span><h4>Sentence variations</h4></div><p>The same item in three progressively denser contexts.</p></div>
        <div class="context-review-sentence-grid">
          ${sentences.map((example, index) => `<article class="context-review-card">
            <span class="context-difficulty">${["EASIER", "BUILD", "HARDER"][index]}</span>
            <p class="context-review-target ${lang === "yue" ? "canto-ruby" : ""}">${lang === "yue" && example.reading ? cantoneseRubyHtml(example.text, example.reading) : escapeHtml(example.text)}</p>
            ${lang !== "yue" && example.reading ? `<p class="context-review-reading">${escapeHtml(example.reading)}</p>` : ""}
            <p class="context-review-translation">${escapeHtml(example.translation || "")}</p>
          </article>`).join("")}
        </div>
      </section>

      <section class="context-review-section">
        <div class="context-review-section-head"><div><span>02</span><h4>Passage variations</h4></div><p>Read for meaning first, then use the prompts to check actual comprehension.</p></div>
        <div class="context-review-passage-list">
          ${passages.map((passage, index) => `<article class="context-passage-card">
            <div class="context-passage-head"><span>${["EASIER", "BUILD", "HARDER"][index]}</span><strong>${passage.questions?.length || 0} comprehension prompts</strong></div>
            <p class="context-passage-text ${lang === "yue" ? "canto-ruby" : ""}">${lang === "yue" && passage.reading ? cantoneseRubyHtml(passage.text, passage.reading) : escapeHtml(passage.text)}</p>
            ${lang !== "yue" && passage.reading ? `<p class="context-review-reading">${escapeHtml(passage.reading)}</p>` : ""}
            <details class="context-translation-details"><summary>Show passage translation</summary><p>${escapeHtml(passage.translation || "")}</p></details>
            <div class="context-question-list">${(passage.questions || []).map(renderContextQuestion).join("")}</div>
          </article>`).join("")}
        </div>
      </section>
      ${directMatches.length ? `<section class="context-review-section">
        <div class="context-review-section-head"><div><span>03</span><h4>Exact reading-bank matches</h4></div><p>Existing bundled sentences or passages that contain this exact vocabulary form.</p></div>
        <div class="direct-reading-list">${directMatches.map(match => renderDirectReadingMatch(match, lang)).join("")}</div>
      </section>` : ""}`;

    const libraryButton = $("[data-context-open-library]", host);
    if (libraryButton) libraryButton.addEventListener("click", () => {
      const dataset = kind === "jpV" ? "japaneseVocabulary" : kind === "jpG" ? "japaneseGrammar" : kind === "yueV" ? "cantoneseVocabulary" : "cantoneseGrammar";
      closeDialog(contextBrowserDialog);
      openLibrary(dataset);
      $("#librarySearch").value = humanizedPattern(kind, item);
      renderLibrary();
    });
  }

  function setContextBrowserLanguage(lang, preserveSearch = false) {
    contextBrowserLang = lang === "yue" ? "yue" : "jp";
    $$('[data-context-lang]').forEach(button => button.classList.toggle("active", button.dataset.contextLang === contextBrowserLang));
    if (!preserveSearch) $("#contextSearchInput").value = "";
    contextBrowserSelectedKey = "";
    populateContextBrowserLevels();
    renderContextBrowserResults();
  }

  function openContextBrowser(kind, id) {
    const entry = kind && id ? byId.get(`${kind}:${id}`) : null;
    const lang = entry ? langFromKind(entry.kind) : contextBrowserLang;
    contextBrowserLang = lang;
    $$('[data-context-lang]').forEach(button => button.classList.toggle("active", button.dataset.contextLang === contextBrowserLang));
    populateContextBrowserLevels();
    if (entry) {
      contextBrowserSelectedKey = itemKey(entry.kind, entry.item);
      $("#contextSearchInput").value = humanizedPattern(entry.kind, entry.item);
    }
    renderContextBrowserResults(contextBrowserSelectedKey);
    showDialog(contextBrowserDialog);
    setTimeout(() => $("#contextSearchInput").focus(), 80);
  }

  // ---------- source library ----------

  const libraryDialog = $("#dataLibrary");
  const datasetConfig = {
    japaneseGrammar: { label: "Japanese grammar", items: source.jpG, kind: "jpG", categoryLabel: "Category" },
    japaneseVocabulary: { label: "Japanese vocabulary", items: source.jpV, kind: "jpV", categoryLabel: "Collection" },
    cantoneseGrammar: { label: "Cantonese grammar", items: source.yueG, kind: "yueG", categoryLabel: "Category" },
    cantoneseVocabulary: { label: "Cantonese vocabulary", items: source.yueV, kind: "yueV", categoryLabel: "Frequency band" }
  };
  let currentDataset = "japaneseGrammar";
  let librarySearchTimer;

  function searchText(kind, item) {
    if (kind === "jpG") return [item.pattern, item.meaning, item.level, item.category, item.course_group].join(" ");
    if (kind === "jpV") return [item.expression, item.reading, item.meaning, item.level, japaneseVocabCollection(item)].join(" ");
    if (kind === "yueG") return [item.pattern, item.jyutping, item.meaning, item.level, item.category, item.usage_note, item.register].join(" ");
    return [item.word, item.jyutping, item.meaning, item.note, yueVocabLevel(item), cantoneseVocabBand(item), ...(item.examples || []).flatMap(example => [example.sentence, example.meaning, example.jyutping])].join(" ");
  }

  function availableLevels(config) {
    if (config.kind === "jpG" || config.kind === "jpV") return JP_LEVELS;
    return YUE_LEVELS;
  }

  function availableCategories(config) {
    return [...new Set(config.items.map(item => itemCategory(config.kind, item)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function librarySortOptions(kind) {
    const base = [
      ["default", "Default order"],
      ["az", "Term A → Z"],
      ["za", "Term Z → A"],
      ["level-asc", "Level: easier first"],
      ["level-desc", "Level: harder first"],
      ["meaning", "Meaning A → Z"]
    ];
    if (kind === "yueV") base.splice(1, 0, ["frequency", "Frequency: common first"]);
    return base;
  }

  function populateLibraryControls() {
    const config = datasetConfig[currentDataset];
    $("#libraryLevel").innerHTML = '<option value="all">All levels</option>' + availableLevels(config)
      .map(level => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join("");
    $("#libraryCategoryLabel").textContent = config.categoryLabel;
    $("#libraryCategory").innerHTML = `<option value="all">All ${config.categoryLabel.toLowerCase()}s</option>` + availableCategories(config)
      .map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
    $("#librarySort").innerHTML = librarySortOptions(config.kind)
      .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  function levelRank(kind, item) {
    const level = itemLevel(kind, item);
    return kind.startsWith("jp") ? JP_LEVELS.indexOf(level) : YUE_LEVELS.indexOf(level);
  }

  function sortLibraryItems(items, kind, sortMode) {
    const copy = [...items];
    const term = item => normalize(humanizedPattern(kind, item));
    if (sortMode === "frequency") return copy.sort((a, b) => (a.frequency_rank || Infinity) - (b.frequency_rank || Infinity));
    if (sortMode === "az") return copy.sort((a, b) => term(a).localeCompare(term(b)));
    if (sortMode === "za") return copy.sort((a, b) => term(b).localeCompare(term(a)));
    if (sortMode === "level-asc") return copy.sort((a, b) => levelRank(kind, a) - levelRank(kind, b));
    if (sortMode === "level-desc") return copy.sort((a, b) => levelRank(kind, b) - levelRank(kind, a));
    if (sortMode === "meaning") return copy.sort((a, b) => normalize(a.meaning).localeCompare(normalize(b.meaning)));
    return copy;
  }

  function renderLibraryItem(kind, item) {
    const grammar = kind.endsWith("G");
    const guide = grammar ? grammarGuide(item) : "";
    const examples = kind === "yueV" && item.examples?.length
      ? `<div class="library-example"><strong>Example</strong><span>${escapeHtml(item.examples[0].sentence || "")}${item.examples[0].jyutping ? ` · ${escapeHtml(item.examples[0].jyutping)}` : ""}</span></div>`
      : "";
    let sourceLinks = "";
    if (kind === "jpG" && item.source_url) {
      sourceLinks = `<a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener">Reference ↗</a>`;
    } else if (kind === "yueG" && item.sources?.length) {
      sourceLinks = item.sources.slice(0, 2).map(sourceItem => `<a href="${escapeHtml(sourceItem.url)}" target="_blank" rel="noopener">${escapeHtml(sourceItem.name)} ↗</a>`).join(" ");
    }

    return `
      <article class="library-item">
        <div class="library-term">
          <span class="item-kind">${grammar ? "GRAMMAR" : "VOCABULARY"}</span>
          <strong>${escapeHtml(humanizedPattern(kind, item))}</strong>
          ${humanizedReading(kind, item) ? `<small>${escapeHtml(humanizedReading(kind, item))}</small>` : ""}
          <button class="inline-audio" data-audio-kind="${kind}" data-audio-id="${escapeHtml(item.id)}">Play pronunciation</button>
        </div>
        <div class="library-description">
          <p>${escapeHtml(meaningOf(item))}</p>
          ${guide ? `<div class="pattern-guide">${escapeHtml(guide)}</div>` : ""}
          ${kind === "yueG" && item.usage_note ? `<div class="usage-note"><strong>How to use it</strong><span>${escapeHtml(item.usage_note)}</span></div>` : ""}
          ${examples}
          <div class="library-item-actions">
            <button class="context-open-button" data-context-kind="${kind}" data-context-id="${escapeHtml(item.id)}">Review sentences & passages ↗</button>
          </div>
          <div class="library-source-links">${sourceLinks}</div>
        </div>
        <div class="library-badges">
          ${metadataParts(kind, item).map(part => `<span class="library-badge">${escapeHtml(part)}</span>`).join("")}
        </div>
      </article>`;
  }

  function renderLibrary() {
    const config = datasetConfig[currentDataset];
    const query = normalize($("#librarySearch").value.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    const selectedLevel = $("#libraryLevel").value;
    const selectedCategory = $("#libraryCategory").value;
    const sortMode = $("#librarySort").value;

    let matches = config.items.filter(item => {
      if (selectedLevel !== "all" && itemLevel(config.kind, item) !== selectedLevel) return false;
      if (selectedCategory !== "all" && itemCategory(config.kind, item) !== selectedCategory) return false;
      if (!terms.length) return true;
      const haystack = normalize(searchText(config.kind, item));
      return terms.every(term => haystack.includes(term));
    });
    matches = sortLibraryItems(matches, config.kind, sortMode);
    const visible = matches.slice(0, 120);

    $("#libraryDatasetLabel").textContent = config.label;
    $("#libraryResultCount").textContent = `${matches.length.toLocaleString()} matches · showing ${visible.length}`;
    $("#libraryResults").innerHTML = visible.length
      ? visible.map(item => renderLibraryItem(config.kind, item)).join("")
      : '<div class="library-empty">No matches found.</div>';

    $$("[data-audio-kind]").forEach(button => {
      button.addEventListener("click", () => {
        const entry = byId.get(`${button.dataset.audioKind}:${button.dataset.audioId}`);
        if (entry) speakItem(entry.kind, entry.item);
      });
    });
    $$("[data-context-kind][data-context-id]", $("#libraryResults")).forEach(button => {
      button.addEventListener("click", () => {
        closeDialog(libraryDialog);
        openContextBrowser(button.dataset.contextKind, button.dataset.contextId);
      });
    });
  }

  function openLibrary(dataset) {
    if (dataset && datasetConfig[dataset]) currentDataset = dataset;
    $$("[data-dataset]").forEach(button => button.classList.toggle("active", button.dataset.dataset === currentDataset));
    $("#librarySearch").value = "";
    populateLibraryControls();
    renderLibrary();
    showDialog(libraryDialog);
  }

  // ---------- dashboard, profile, progress ----------

  function renderDashboard() {
    const jpMastery = languageMastery("jp");
    const yueMastery = languageMastery("yue");
    const today = todayKey();
    const jpToday = state.activity.jp[today] || 0;
    const yueToday = state.activity.yue[today] || 0;
    const jpGoal = Math.max(1, Number(state.profile.jpDailyGoal) || 30);
    const yueGoal = Math.max(1, Number(state.profile.yueDailyGoal) || 30);
    const learned = learnedEntries();
    const due = dueEntries();

    $("#streak").textContent = streak();
    $("#profileNameTop").textContent = state.profile.name;
    $("#avatarTop").textContent = (state.profile.name.trim()[0] || "間").toUpperCase();
    $("#jpXpTop").textContent = `${state.xp.jp} XP`;
    $("#yueXpTop").textContent = `${state.xp.yue} XP`;
    $("#jpXpCard").textContent = state.xp.jp;
    $("#yueXpCard").textContent = state.xp.yue;
    $("#jpTargetCard").textContent = state.profile.jpTarget;
    $("#yueTargetCard").textContent = state.profile.yueTarget;
    $("#jpProgressValue").textContent = `${jpMastery}%`;
    $("#yueProgressValue").textContent = `${yueMastery}%`;
    $("#jpGoalText").textContent = `${jpToday} / ${jpGoal} items`;
    $("#yueGoalText").textContent = `${yueToday} / ${yueGoal} items`;
    $("#jpGoalBar").style.width = `${clamp((jpToday / jpGoal) * 100, 0, 100)}%`;
    $("#yueGoalBar").style.width = `${clamp((yueToday / yueGoal) * 100, 0, 100)}%`;
    $("#jpScopeText").textContent = targetScopeText("jp");
    $("#yueScopeText").textContent = targetScopeText("yue");

    $("#reviewAllCount").textContent = learned.length;
    $("#reviewDueCount").textContent = due.length;
    $("#reviewJpCount").textContent = learnedEntries("jp").length;
    $("#reviewYueCount").textContent = learnedEntries("yue").length;

    const reviewPreview = reviewSort(learned).slice(0, 4);
    $("#reviewList").innerHTML = reviewPreview.length
      ? reviewPreview.map(entry => `
          <button class="review-item" data-action="review">
            <span class="lang-dot">${langFromKind(entry.kind) === "jp" ? "日" : "粵"}</span>
            <span><strong>${escapeHtml(humanizedPattern(entry.kind, entry.item))}</strong><small>${escapeHtml(itemLevel(entry.kind, entry.item))} · Mastery ${entry.srs.mastery || 0}%</small></span>
            <em>${entry.srs.due <= Date.now() ? "Due" : "Saved"}</em>
          </button>`).join("")
      : '<button class="review-item empty-review" data-action="open-study">No learned items yet — start a study session.</button>';
    $$("#reviewList [data-action='review']").forEach(button => button.addEventListener("click", openReview));
    $$("#reviewList [data-action='open-study']").forEach(button => button.addEventListener("click", () => openStudy()));

    const week = weekData();
    const max = Math.max(1, ...week.flatMap(day => [day.jp, day.yue]));
    $("#weekChart").innerHTML = week.map(day => `
      <div class="day-column" title="${day.key} · Japanese ${day.jp}, Cantonese ${day.yue}">
        <div class="bar-pair">
          <i class="jp-bar" style="--h:${Math.max(day.jp ? 8 : 0, Math.round((day.jp / max) * 100))}%"></i>
          <i class="yue-bar" style="--h:${Math.max(day.yue ? 8 : 0, Math.round((day.yue / max) * 100))}%"></i>
        </div>
        <span>${day.label}</span>
      </div>`).join("");
    const weekJp = week.reduce((sum, day) => sum + day.jp, 0);
    const weekYue = week.reduce((sum, day) => sum + day.yue, 0);
    $("#weeklyProgressText").textContent = weekJp + weekYue
      ? `${weekJp} Japanese items · ${weekYue} Cantonese items studied this week.`
      : "Start your first study session.";

    $("#countJpGrammar").textContent = source.jpG.length.toLocaleString();
    $("#countJpVocab").textContent = source.jpV.length.toLocaleString();
    $("#countYueGrammar").textContent = source.yueG.length.toLocaleString();
    $("#countYueVocab").textContent = source.yueV.length.toLocaleString();
  }

  function openProfile() {
    $("#profileNameInput").value = state.profile.name;
    $("#jpTargetInput").value = state.profile.jpTarget;
    $("#yueTargetInput").value = state.profile.yueTarget;
    $("#jpDailyGoalInput").value = state.profile.jpDailyGoal;
    $("#yueDailyGoalInput").value = state.profile.yueDailyGoal;
    $("#profileStats").innerHTML = `
      <div class="profile-stat"><strong>${state.xp.jp}</strong><span>Japanese XP</span></div>
      <div class="profile-stat"><strong>${state.xp.yue}</strong><span>Cantonese XP</span></div>
      <div class="profile-stat"><strong>${learnedEntries().length}</strong><span>items learned</span></div>
      <div class="profile-stat"><strong>${streak()}</strong><span>day streak</span></div>`;
    renderAudioStatus();
    ensureVoices().then(() => { populateVoiceSelectors(); renderAudioStatus(); });
    showDialog($("#profileDialog"));
  }

  function saveProfile() {
    state.profile = {
      name: $("#profileNameInput").value.trim() || "Learner",
      jpTarget: $("#jpTargetInput").value,
      yueTarget: $("#yueTargetInput").value,
      jpDailyGoal: Math.max(1, Math.round(Number($("#jpDailyGoalInput").value) || 30)),
      yueDailyGoal: Math.max(1, Math.round(Number($("#yueDailyGoalInput").value) || 30))
    };
    saveState();
    closeDialog($("#profileDialog"));
    showToast("Settings saved locally.");
  }

  function languageAccuracy(lang) {
    const answers = state.answers[lang];
    const total = answers.correct + answers.wrong;
    return total ? Math.round((answers.correct / total) * 100) : 0;
  }

  function openProgress() {
    const rows = [
      ["Japanese grammar", "jpG"],
      ["Japanese vocabulary", "jpV"],
      ["Cantonese grammar", "yueG"],
      ["Cantonese vocabulary", "yueV"]
    ];
    $("#progressDashboard").innerHTML = `
      <div class="progress-kpis">
        <div class="progress-kpi"><strong>${state.xp.jp}</strong><span>Japanese XP</span></div>
        <div class="progress-kpi"><strong>${state.xp.yue}</strong><span>Cantonese XP</span></div>
        <div class="progress-kpi"><strong>${languageMastery("jp")}%</strong><span>Japanese average mastery</span></div>
        <div class="progress-kpi"><strong>${languageMastery("yue")}%</strong><span>Cantonese average mastery</span></div>
      </div>
      <div class="progress-targets">
        <div><span>Japanese target</span><strong>${escapeHtml(state.profile.jpTarget)}</strong><small>${escapeHtml(targetScopeText("jp"))}</small></div>
        <div><span>Cantonese target</span><strong>${escapeHtml(state.profile.yueTarget)}</strong><small>${escapeHtml(targetScopeText("yue"))}</small></div>
      </div>
      <div class="mastery-table">
        ${rows.map(([label, prefix]) => {
          const entries = learnedEntries().filter(entry => entry.kind === prefix);
          const mastery = entries.length ? Math.round(entries.reduce((sum, entry) => sum + (entry.srs.mastery || 0), 0) / entries.length) : 0;
          return `<div class="mastery-row"><span>${label} · ${entries.length}</span><div class="mastery-bar"><i style="width:${mastery}%"></i></div><strong>${mastery}%</strong></div>`;
        }).join("")}
      </div>`;
    showDialog($("#progressDialog"));
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aida-progress-${todayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = migrateState(JSON.parse(reader.result));
        saveState();
        closeDialog($("#profileDialog"));
        showToast("Progress imported.");
      } catch {
        showToast("Could not import that progress file.");
      }
    };
    reader.readAsText(file);
  }

  function openClearProgressDialog() {
    $("#clearProgressConfirm").value = "";
    $("#confirmClearProgress").disabled = true;
    showDialog($("#clearProgressDialog"));
    setTimeout(() => $("#clearProgressConfirm").focus(), 80);
  }

  function clearLearningProgress() {
    const profile = { ...state.profile };
    const preferredStudyLanguage = state.preferredStudyLanguage;
    state = defaultState();
    state.profile = profile;
    state.preferredStudyLanguage = preferredStudyLanguage;
    saveState();
    passageAssessment = null;
    closeDialog($("#clearProgressDialog"));
    closeDialog($("#profileDialog"));
    showToast("Learning progress cleared. Your settings were kept.");
  }

  // ---------- event wiring ----------

  $$("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "home") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (action === "open-study" || action === "new-session") openStudy();
      else if (action === "close-study") closeDialog(studyDialog);
      else if (action === "review") openReview();
      else if (action === "close-review") closeDialog(reviewDialog);
      else if (action === "usage-lab") { setLabMode(labMode); showDialog(usageDialog); }
      else if (action === "close-usage") closeDialog(usageDialog);
      else if (action === "context-browser") openContextBrowser();
      else if (action === "close-context-browser") closeDialog(contextBrowserDialog);
      else if (action === "data-library") openLibrary();
      else if (action === "close-library") closeDialog(libraryDialog);
      else if (action === "profile") openProfile();
      else if (action === "close-profile") closeDialog($("#profileDialog"));
      else if (action === "progress") openProgress();
      else if (action === "close-progress") closeDialog($("#progressDialog"));
      else if (action === "close-clear-progress") closeDialog($("#clearProgressDialog"));
    });
  });

  $$("[data-study-language]").forEach(button => button.addEventListener("click", () => openStudy(button.dataset.studyLanguage)));
  $$("[data-study-switch]").forEach(button => button.addEventListener("click", () => applyStudyLanguage(button.dataset.studySwitch)));
  $$("[data-library-dataset]").forEach(button => button.addEventListener("click", () => openLibrary(button.dataset.libraryDataset)));
  $$("[data-review-filter]").forEach(button => button.addEventListener("click", () => rebuildReviewQueue(button.dataset.reviewFilter)));
  $$("[data-lab]").forEach(button => button.addEventListener("click", () => setLabMode(button.dataset.lab)));
  $$('[data-context-lang]').forEach(button => button.addEventListener("click", () => setContextBrowserLanguage(button.dataset.contextLang)));
  $$("[data-dataset]").forEach(button => button.addEventListener("click", () => {
    currentDataset = button.dataset.dataset;
    $$("[data-dataset]").forEach(item => item.classList.toggle("active", item === button));
    $("#librarySearch").value = "";
    populateLibraryControls();
    renderLibrary();
  }));

  $("#generateSession").addEventListener("click", generateSession);
  $$("[data-rating]").forEach(button => button.addEventListener("click", () => rateCurrent(Number(button.dataset.rating))));
  $("#singleStudyCard").addEventListener("click", event => {
    if (event.target.closest("button")) return;
    revealStudyCard();
  });
  $("#singleStudyCard").addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
      event.preventDefault();
      revealStudyCard();
    }
  });
  $("#speakCurrent").addEventListener("click", event => {
    event.stopPropagation();
    const entry = study.items[study.index];
    if (entry) speakItem(entry.kind, entry.item);
  });
  $("#speakPassage").addEventListener("click", () => {
    const entry = study.items[study.index];
    if (entry?.kind.endsWith("P")) speakItem(entry.kind, entry.item);
  });
  $("#startPassageQuestions").addEventListener("click", startPassageQuestions);
  $("#checkPassageAnswer").addEventListener("click", checkPassageAnswer);
  $("#passageResponse").addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") checkPassageAnswer();
  });
  $("#markPassageWrong").addEventListener("click", () => selfGradePassageQuestion(false));
  $("#markPassageCorrect").addEventListener("click", () => selfGradePassageQuestion(true));
  $("#continueAfterPassage").addEventListener("click", continueAfterPassage);
  $("#speakReview").addEventListener("click", () => {
    const entry = reviewQueue[reviewIndex];
    if (entry) speakItem(entry.kind, entry.item);
  });

  $("#usageInput").addEventListener("input", event => {
    $("#charCount").textContent = `${event.target.value.length}/2000`;
  });
  $("#sendUsage").addEventListener("click", analyzeUsage);

  ["#contextLevelFilter", "#contextTypeFilter"].forEach(selector => $(selector).addEventListener("change", () => renderContextBrowserResults()));
  $("#contextSearchInput").addEventListener("input", () => {
    clearTimeout(contextSearchTimer);
    contextSearchTimer = setTimeout(() => renderContextBrowserResults(), 120);
  });

  ["#libraryLevel", "#libraryCategory", "#librarySort"].forEach(selector => $(selector).addEventListener("change", renderLibrary));
  $("#librarySearch").addEventListener("input", () => {
    clearTimeout(librarySearchTimer);
    librarySearchTimer = setTimeout(renderLibrary, 120);
  });
  $("#randomLibraryItem").addEventListener("click", () => {
    const config = datasetConfig[currentDataset];
    const random = config.items[Math.floor(Math.random() * config.items.length)];
    $("#librarySearch").value = config.kind.endsWith("G")
      ? (random.pattern || "")
      : config.kind === "jpV" ? (random.expression || "") : (random.word || "");
    $("#libraryLevel").value = "all";
    $("#libraryCategory").value = "all";
    renderLibrary();
  });


  ["#jpVoiceSelect", "#yueVoiceSelect"].forEach(selector => {
    $(selector).addEventListener("change", event => {
      state.audio ||= { jpVoiceId: "", yueVoiceId: "" };
      state.audio[selector === "#jpVoiceSelect" ? "jpVoiceId" : "yueVoiceId"] = event.target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAudioStatus();
    });
  });

  $("#refreshAudioVoices").addEventListener("click", async () => {
    await ensureVoices();
    refreshVoices();
    renderAudioStatus();
    showToast("Browser voice list refreshed.");
  });
  $("#testJapaneseAudio").addEventListener("click", () => speakItem("jpS", { text: "日本語の音声を確認しています。" }));
  $("#testCantoneseAudio").addEventListener("click", () => speakItem("yueS", { text: "而家測試廣東話發音。" }));

  $("#saveProfile").addEventListener("click", saveProfile);
  $("#exportProgress").addEventListener("click", exportProgress);
  $("#openClearProgress").addEventListener("click", openClearProgressDialog);
  $("#clearProgressConfirm").addEventListener("input", event => {
    $("#confirmClearProgress").disabled = event.target.value.trim() !== "CLEAR";
  });
  $("#confirmClearProgress").addEventListener("click", () => {
    if ($("#clearProgressConfirm").value.trim() === "CLEAR") clearLearningProgress();
  });
  $("#importProgress").addEventListener("change", event => {
    if (event.target.files?.[0]) importProgress(event.target.files[0]);
  });
  $("#streakButton").addEventListener("click", () => {
    const key = todayKey();
    showToast(`${streak()}-day streak · Japanese ${state.activity.jp[key] || 0}/${state.profile.jpDailyGoal} · Cantonese ${state.activity.yue[key] || 0}/${state.profile.yueDailyGoal}`);
  });

  [libraryDialog, contextBrowserDialog, studyDialog, reviewDialog, usageDialog, $("#profileDialog"), $("#progressDialog"), $("#clearProgressDialog")].forEach(dialog => {
    dialog?.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });

  populateLibraryControls();
  setLabMode("ja");
  renderDashboard();
})();
