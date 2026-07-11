(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DATA = window.AIDA_DATA || {};
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

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function defaultState() {
    return {
      version: 4,
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
      preferredStudyLanguage: "jp"
    };
  }

  function migrateState(raw) {
    const fresh = defaultState();
    if (!raw || typeof raw !== "object") return fresh;

    if (raw.version === 4) {
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
        }
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

  function studyPool(lang, focus) {
    const grammarKind = lang === "jp" ? "jpG" : "yueG";
    const vocabKind = lang === "jp" ? "jpV" : "yueV";
    const sentenceKind = lang === "jp" ? "jpS" : "yueS";
    const passageKind = lang === "jp" ? "jpP" : "yueP";
    const grammar = source[grammarKind].filter(item => inTarget(grammarKind, item, lang));
    const vocabulary = source[vocabKind].filter(item => inTarget(vocabKind, item, lang));
    const sentences = source[sentenceKind].filter(item => inTarget(sentenceKind, item, lang));
    const passages = source[passageKind].filter(item => inTarget(passageKind, item, lang));
    if (focus === "grammar") return grammar.map(item => ({ kind: grammarKind, item }));
    if (focus === "vocabulary") return vocabulary.map(item => ({ kind: vocabKind, item }));
    if (focus === "sentences") return sentences.map(item => ({ kind: sentenceKind, item }));
    if (focus === "passages") return passages.map(item => ({ kind: passageKind, item }));
    return [
      ...grammar.map(item => ({ kind: grammarKind, item })),
      ...vocabulary.map(item => ({ kind: vocabKind, item })),
      ...sentences.map(item => ({ kind: sentenceKind, item })),
      ...passages.map(item => ({ kind: passageKind, item }))
    ];
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
    const unseen = shuffled(entries.filter(entry => !state.srs[itemKey(entry.kind, entry.item)]));
    const learned = shuffled(entries.filter(entry => state.srs[itemKey(entry.kind, entry.item)]));
    return [...unseen, ...learned].slice(0, count);
  }

  function buildStudyItems(lang, focus, count) {
    if (focus !== "mixed") return prioritizedSample(studyPool(lang, focus), count);

    // Mixed sessions deliberately reserve space for comprehension instead of
    // letting the much larger vocabulary pool crowd sentences and passages out.
    const buckets = [
      { focus: "vocabulary", weight: 0.35 },
      { focus: "grammar", weight: 0.35 },
      { focus: "sentences", weight: 0.20 },
      { focus: "passages", weight: 0.10 }
    ].map(bucket => ({ ...bucket, entries: studyPool(lang, bucket.focus) }));

    const selected = [];
    const used = new Set();
    buckets.forEach(bucket => {
      let quota = Math.floor(count * bucket.weight);
      if (bucket.focus === "passages" && count >= 5) quota = Math.max(1, quota);
      if (bucket.focus === "sentences" && count >= 4) quota = Math.max(1, quota);
      prioritizedSample(bucket.entries, quota).forEach(entry => {
        const key = itemKey(entry.kind, entry.item);
        if (!used.has(key)) { used.add(key); selected.push(entry); }
      });
    });

    if (selected.length < count) {
      prioritizedSample(studyPool(lang, "mixed"), count * 2).forEach(entry => {
        if (selected.length >= count) return;
        const key = itemKey(entry.kind, entry.item);
        if (!used.has(key)) { used.add(key); selected.push(entry); }
      });
    }
    return shuffled(selected).slice(0, count);
  }

  // ---------- audio ----------

  let speechVoices = [];
  let voiceLoadPromise = null;

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return [];
    speechVoices = window.speechSynthesis.getVoices() || [];
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
      const handler = () => finish();
      window.speechSynthesis.addEventListener?.("voiceschanged", handler, { once: true });
      setTimeout(finish, 250);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          refreshVoices();
          resolve(speechVoices);
        }
      }, 1200);
    }).finally(() => { voiceLoadPromise = null; });
    return voiceLoadPromise;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    refreshVoices();
  }

  function voiceScore(voice, lang) {
    const locale = normalize(voice.lang);
    const name = normalize(voice.name);
    let score = 0;
    if (lang === "jp") {
      if (locale === "ja-jp") score += 130;
      else if (locale.startsWith("ja")) score += 100;
      if (/nanami|haruka|ayumi|kyoko|otoya|ichiro|japanese/.test(name)) score += 15;
    } else {
      // Browsers and operating systems usually expose Hong Kong Cantonese as zh-HK;
      // some expose a yue-HK locale. Prefer either over Mandarin locales.
      if (locale === "yue-hk") score += 170;
      else if (locale.startsWith("yue")) score += 155;
      else if (locale === "zh-hk") score += 150;
      else if (locale.startsWith("zh-hk")) score += 145;
      if (/hiumaan|hiugaai|wanlung|cantonese|hong kong|hongkong/.test(name)) score += 30;
      if (/mandarin|putonghua/.test(name)) score -= 100;
    }
    return score;
  }

  function pickVoice(lang) {
    const ranked = speechVoices
      .map(voice => ({ voice, score: voiceScore(voice, lang) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.voice || null;
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
      container.innerHTML = '<div class="audio-status-row bad"><strong>Browser speech unavailable</strong><span>Use a current desktop browser or connect a hosted TTS provider.</span></div>';
      return;
    }
    const jp = pickVoice("jp");
    const yue = pickVoice("yue");
    container.innerHTML = `
      <div class="audio-status-row ${jp ? "good" : "bad"}"><strong>Japanese</strong><span>${jp ? escapeHtml(`${jp.name} · ${jp.lang}`) : "No Japanese voice detected"}</span></div>
      <div class="audio-status-row ${yue ? "good" : "bad"}"><strong>Cantonese</strong><span>${yue ? escapeHtml(`${yue.name} · ${yue.lang}`) : "No yue-HK / zh-HK voice detected"}</span></div>
      ${yue ? "" : '<p class="audio-help">On Windows, install the Chinese (Traditional, Hong Kong SAR) language/voice features, restart the browser, then press Refresh voices. For guaranteed audio on every device, use a hosted Cantonese TTS service and serve the generated audio through a backend or serverless function.</p>'}`;
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
    if (lang === "yue" && !voice) {
      renderAudioStatus();
      showToast("No Cantonese / Hong Kong voice is installed. Open Profile → Audio setup for the exact fix.");
      return;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "jp" ? (voice?.lang || "ja-JP") : (voice?.lang || "zh-HK");
    if (voice) utterance.voice = voice;
    utterance.rate = lang === "jp" ? 0.86 : 0.78;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onerror = event => {
      console.warn("AIDA speech error", event.error);
      showToast(`Could not play ${languageName(lang)} audio with the selected browser voice.`);
    };
    window.speechSynthesis.speak(utterance);
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
    $("#studyReading").textContent = humanizedReading(kind, item);
    $("#studyMeaning").textContent = meaningOf(item);
    $("#studyMeta").textContent = displayMeta(kind, item);

    const guide = comprehension
      ? `Answer: ${item.answer}`
      : grammar ? `${item.usage_note || ""}${grammarGuide(item) ? ` ${grammarGuide(item)}` : ""}`.trim() : "";
    $("#studyGuide").classList.toggle("hidden", !guide);
    $("#studyGuide").textContent = guide;
    $("#speakCurrent").disabled = !speechText(kind, item);

    $("#singleStudyCard").classList.remove("revealed");
    $("#studyAnswer").classList.add("hidden");
    $("#studyActions").classList.add("hidden");
    $("#studyRevealHint").classList.remove("hidden");
  }

  function revealStudyCard() {
    if (study.revealed) return;
    study.revealed = true;
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
    schedule(entry.kind, entry.item, rating);
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
    $("#passageQuestionPrompt").textContent = question.prompt || question.question || "What does this passage mean?";
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
    schedule(entry.kind, entry.item, rating);
    study.ratings.push(rating);

    $("#passageQuestionStage").classList.add("hidden");
    $("#passageResultStage").classList.remove("hidden");
    $("#passageScoreOrb").textContent = `${accuracy}%`;
    $("#passageResultSummary").textContent = `${correct} of ${questions.length} questions marked correct. The passage was scheduled as ${rating === 5 ? "Easy" : rating === 4 ? "Good" : rating === 2 ? "Hard" : "Again"}.`;
    $("#passageResultReading").textContent = humanizedReading(entry.kind, entry.item) || "No separate reading guide is bundled for this passage.";
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

    $("#reviewSessionCount").textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
    $("#reviewSessionDue").textContent = due ? "Due now" : `Mastery ${entry.srs.mastery || 0}%`;
    $("#reviewSideLabel").textContent = lang === "jp" ? "JAPANESE REVIEW" : "CANTONESE REVIEW";
    $("#reviewPrompt").textContent = humanizedPattern(entry.kind, entry.item);
    $("#reviewPromptSub").textContent = entry.kind.endsWith("P")
      ? "Recall the passage meaning and main ideas before revealing."
      : humanizedReading(entry.kind, entry.item) || "Recall the meaning and usage before revealing.";
    $("#speakReview").disabled = !speechText(entry.kind, entry.item);
    $("#reviewReveal").classList.add("hidden");
    $("#reviewReveal").innerHTML = `
      ${entry.kind.endsWith("P") && humanizedReading(entry.kind, entry.item) ? `<p>${escapeHtml(humanizedReading(entry.kind, entry.item))}</p>` : ""}
      <strong>${escapeHtml(meaningOf(entry.item))}</strong>
      ${entry.kind.endsWith("G") && grammarGuide(entry.item) ? `<p>${escapeHtml(grammarGuide(entry.item))}</p>` : ""}
      <small>${escapeHtml(displayMeta(entry.kind, entry.item))}</small>`;
    $("#reviewControls").innerHTML = '<button class="btn primary" id="revealReview">Reveal answer</button>';
    $("#revealReview").addEventListener("click", revealReview);
  }

  function revealReview() {
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
      sentences: ["ここに座ってもいいですか？", "雨が降っていたので、電車で会社に行きました。"],
      passages: [
        "先週、新しいアルバイトを始めました。仕事は少し忙しいですが、店の人たちは親切です。まだ覚えることがたくさんあるので、毎日メモを取りながら働いています。"
      ]
    },
    yue: {
      sentences: ["我未做完功課，所以今晚唔出去。", "如果聽日落大雨，我哋就改喺屋企食飯。"],
      passages: [
        "有時候學語言最難唔係記生字，而係明明識個字，真正同人講嘢嗰陣又反應唔切。所以我而家會將新詞放落自己常用嘅句子入面，再隔幾日重新講一次。"
      ]
    }
  };

  const lexiconTries = {};
  const structuralMarkers = new Set([
    "係", "喺", "嘅", "咗", "緊", "過", "唔", "冇", "未", "畀", "比", "就", "先", "都", "又", "仲", "呢", "嗰",
    "は", "が", "を", "に", "へ", "で", "と", "も", "の", "から", "まで", "より", "て", "ば", "なら", "ので", "のに"
  ]);

  function buildLexiconTrie(mode) {
    if (lexiconTries[mode]) return lexiconTries[mode];
    const root = { next: Object.create(null), item: null };
    const items = mode === "yue" ? source.yueV : source.jpV;
    const getWord = mode === "yue" ? item => item.word : item => item.expression;
    items.forEach(item => {
      const word = String(getWord(item) || "").trim();
      if (!word || word.length > 24) return;
      let node = root;
      for (const char of word) {
        node.next[char] ||= { next: Object.create(null), item: null };
        node = node.next[char];
      }
      // Keep the most common Cantonese entry if duplicates exist.
      if (!node.item || mode !== "yue" || (item.frequency_rank || Infinity) < (node.item.frequency_rank || Infinity)) node.item = item;
    });
    lexiconTries[mode] = root;
    return root;
  }

  function segmentText(text, mode) {
    const trie = buildLexiconTrie(mode);
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      if (/\s/.test(char)) { i += 1; continue; }
      if (/[。！？!?、，,.；;：「」『』（）()\[\]…]/.test(char)) {
        tokens.push({ text: char, punctuation: true });
        i += 1;
        continue;
      }
      let node = trie;
      let best = null;
      let j = i;
      while (j < text.length && node.next[text[j]]) {
        node = node.next[text[j]];
        j += 1;
        if (node.item) best = { item: node.item, end: j };
      }
      if (best) {
        tokens.push({ text: text.slice(i, best.end), item: best.item, known: true });
        i = best.end;
      } else {
        const previous = tokens[tokens.length - 1];
        if (previous && !previous.known && !previous.punctuation) previous.text += char;
        else tokens.push({ text: char, known: false });
        i += 1;
      }
    }
    return tokens;
  }

  function scriptChunks(pattern, mode) {
    const rx = mode === "yue" ? /[\u3400-\u9fff]+/g : /[\u3040-\u30ff\u3400-\u9fff]+/g;
    return String(pattern || "").match(rx) || [];
  }

  function matchGrammar(sentence, mode) {
    const items = mode === "yue" ? source.yueG : source.jpG;
    const hits = [];
    for (const item of items) {
      const chunks = scriptChunks(item.pattern, mode);
      if (!chunks.length) continue;
      const matched = chunks.filter(chunk => sentence.includes(chunk));
      if (!matched.length) continue;
      const strongest = Math.max(...matched.map(chunk => chunk.length));
      if (strongest < 2 && !matched.some(chunk => structuralMarkers.has(chunk))) continue;
      const coverage = matched.length / chunks.length;
      const specificity = matched.reduce((sum, chunk) => sum + Math.min(4, chunk.length), 0);
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
    return tokens.filter(token => token.known && token.item).map(token => token.item).filter(item => {
      const key = vocabItemFields(item, mode).word;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function structureHints(tokens, mode) {
    const words = tokens.filter(token => !token.punctuation).map(token => token.text);
    const joined = words.join("");
    const hints = [];
    if (mode === "ja") {
      const particles = {
        "は": "topic marker — the phrase before は is usually what the sentence is about",
        "が": "subject/focus marker — often identifies who or what performs or experiences something",
        "を": "direct-object marker — the phrase before を usually receives the action",
        "に": "destination, time, recipient, or target marker",
        "へ": "direction marker",
        "で": "location of an action, means, or instrument",
        "の": "links nouns; often possession or noun modification",
        "と": "quotation, companion, or complete-list marker",
        "から": "starting point or reason",
        "ので": "reason/cause connector",
        "ても": "concession: even if / even though"
      };
      Object.entries(particles).forEach(([marker, explanation]) => {
        if (joined.includes(marker)) hints.push({ label: marker, explanation });
      });
      if (/です|ます|ました|ません/.test(joined)) hints.push({ label: "Polite predicate", explanation: "A です/ます-family ending indicates polite speech." });
      if (/ている|ています/.test(joined)) hints.push({ label: "Ongoing/state", explanation: "〜ている commonly marks an ongoing action or resulting state." });
    } else {
      const markers = {
        "係": "copula — links a person or thing to an identity/category",
        "喺": "location marker/verb — indicates where someone or something is",
        "唔": "general negation — not / do not",
        "冇": "negative of 有 and common completed-event negation",
        "未": "not yet",
        "咗": "perfective/change marker — an event has occurred or a state has changed",
        "緊": "ongoing/progressive aspect",
        "過": "experiential aspect — has done before",
        "嘅": "links a modifier or possessor to a noun; also appears in sentence-final uses",
        "畀": "give/recipient marker and, in some structures, passive marker",
        "如果": "if-clause opener",
        "就": "often marks the result/consequence that follows a condition",
        "所以": "therefore / so — introduces a result",
        "雖然": "although — usually sets up a contrast",
        "但係": "but — contrast connector"
      };
      Object.entries(markers).forEach(([marker, explanation]) => {
        if (joined.includes(marker)) hints.push({ label: marker, explanation });
      });
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
    return (text.match(/[^。！？!?\n]+[。！？!?]?/g) || [])
      .map(sentence => sentence.trim())
      .filter(Boolean);
  }

  function analyzeSentence(sentence, mode) {
    const tokens = segmentText(sentence, mode);
    const grammarHits = matchGrammar(sentence, mode);
    const vocabHits = uniqueKnownVocab(tokens, mode);
    const hints = structureHints(tokens, mode);
    const register = registerInference(sentence, mode, grammarHits);
    const targetChars = [...sentence].filter(char => /[\u3040-\u30ff\u3400-\u9fff]/.test(char)).length || 1;
    const knownChars = tokens.filter(token => token.known).reduce((sum, token) => sum + [...token.text].length, 0);
    return { sentence, tokens, grammarHits, vocabHits, hints, register, coverage: clamp(Math.round(knownChars / targetChars * 100), 0, 100) };
  }

  function renderToken(token, mode) {
    if (token.punctuation) return `<span class="seg-token punctuation">${escapeHtml(token.text)}</span>`;
    if (!token.known || !token.item) return `<span class="seg-token unknown" title="Not found as a bundled vocabulary entry">${escapeHtml(token.text)}</span>`;
    const fields = vocabItemFields(token.item, mode);
    const title = [fields.reading, fields.meaning].filter(Boolean).join(" · ");
    return `<span class="seg-token known" title="${escapeHtml(title)}"><b>${escapeHtml(token.text)}</b>${fields.reading ? `<small>${escapeHtml(fields.reading)}</small>` : ""}</span>`;
  }

  function renderUsageExamples() {
    const group = usageExamples[labMode];
    $("#usageExamples").innerHTML = `
      <div class="example-group"><small>Sentences</small>${group.sentences.map(example => `<button data-usage-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}</div>
      <div class="example-group"><small>Passage</small>${group.passages.map(example => `<button data-usage-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join("")}</div>`;
    $$('[data-usage-example]').forEach(button => {
      button.addEventListener("click", () => {
        $("#usageInput").value = button.dataset.usageExample;
        $("#usageInput").dispatchEvent(new Event("input"));
        analyzeUsage();
      });
    });
  }

  function setLabMode(mode) {
    labMode = mode === "yue" ? "yue" : "ja";
    $$('[data-lab]').forEach(button => button.classList.toggle("active", button.dataset.lab === labMode));
    $("#usageInput").placeholder = labMode === "ja" ? "日本語の文・段落を入力…" : "輸入廣東話句子或段落…";
    $("#usageInput").value = "";
    $("#charCount").textContent = "0/2000";
    $("#labAnalysis").innerHTML = '<div class="analysis-empty">Paste a sentence or passage. AIDA will separate known words, identify basic structure markers, and match local grammar patterns.</div>';
    $$(".verify-check").forEach(node => { node.textContent = "—"; });
    renderUsageExamples();
  }

  function analyzeUsage() {
    const text = $("#usageInput").value.trim();
    if (!text) {
      showToast("Type or paste a sentence or passage first.");
      return;
    }

    const sentences = splitIntoSentences(text);
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
          <div class="analysis-subsection"><h5>Basic structure</h5><div class="structure-grid">${structureHtml}</div></div>
          <div class="analysis-subsection"><h5>Grammar matches</h5>${grammarHtml}</div>
          <div class="analysis-subsection"><h5>Register</h5><div class="analysis-match"><span>${escapeHtml(analysis.register.label)}</span></div></div>
        </article>`;
    }).join("");

    $("#labAnalysis").innerHTML = `
      <div class="analysis-overview">
        <div><strong>${sentences.length}</strong><span>${sentences.length === 1 ? "sentence" : "sentences"}</span></div>
        <div><strong>${grammarCount}</strong><span>grammar matches</span></div>
        <div><strong>${averageCoverage}%</strong><span>known-word coverage</span></div>
      </div>
      ${sentences.length > 1 ? `<div class="sentence-jump-nav"><span>Jump to</span>${sentences.map((_, index) => `<button data-jump-sentence="${index}">${index + 1}</button>`).join("")}</div><div class="passage-note">Passage mode: analysis is broken down sentence by sentence so structure does not bleed across sentence boundaries.</div>` : ""}
      ${sentenceHtml}`;

    $$('[data-jump-sentence]', $("#labAnalysis")).forEach(button => {
      button.addEventListener("click", () => {
        const target = $(`#analysisSentence-${button.dataset.jumpSentence}`, $("#labAnalysis"));
        if (target) $("#labAnalysis").scrollTo({ top: Math.max(0, target.offsetTop - 8), behavior: "smooth" });
      });
    });
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
    ensureVoices().then(renderAudioStatus);
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

  [libraryDialog, studyDialog, reviewDialog, usageDialog, $("#profileDialog"), $("#progressDialog"), $("#clearProgressDialog")].forEach(dialog => {
    dialog?.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });

  populateLibraryControls();
  setLabMode("ja");
  renderDashboard();
})();
