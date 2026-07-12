(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DATA = window.AIDA_DATA || {};
  const CONTEXT = DATA.contextExamples || {};
  const GRAMMAR_OVERRIDES = DATA.grammarOverrides || {};
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
    yueP: [...(DATA.comprehension?.cantonese?.passages || []), ...(DATA.readingPassages?.cantonese || [])],
    jpC: DATA.casualLanguage?.japanese || [],
    yueC: DATA.casualLanguage?.cantonese || []
  };

  const byId = new Map();
  Object.entries(source).forEach(([kind, items]) => {
    items.forEach(item => byId.set(`${kind}:${item.id}`, { kind, item }));
  });

  const JP_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const YUE_LEVELS = ["Beginner", "Intermediate", "Advanced"];
  const YUE_VOCAB_LIMITS = { Beginner: 3000, Intermediate: 12000, Advanced: Infinity };
  const XP_AWARDS = { 1: 2, 2: 5, 4: 9, 5: 12 };
  const SKILLS = ["recognition", "production", "listening", "reading", "grammar", "casual"];
  const SKILL_LABELS = {
    recognition: "Recognition",
    production: "Production",
    listening: "Listening",
    reading: "Reading",
    grammar: "Grammar",
    casual: "Casual register"
  };
  const UI_TO_FSRS_RATING = { 1: 1, 2: 2, 4: 3, 5: 4 };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const normalize = value => String(value ?? "").normalize("NFKC").toLocaleLowerCase();
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
  const titleCase = value => String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());

  const QUALITY_LABELS = {
    curated: "CURATED",
    corpus: "CORPUS AUTHENTIC",
    audited: "AUDITED",
    validated: "RULE VALIDATED",
    generated: "GENERATED",
    unverified: "UNVERIFIED"
  };
  const qualityExampleRegistry = new Map();
  let pendingQualityKey = "";

  function stableTextHash(text) {
    let hash = 2166136261;
    for (const char of String(text || "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function qualityStatusFor(example = {}) {
    const explicit = normalize(example.qualityStatus || example.quality || "");
    if (explicit && QUALITY_LABELS[explicit]) return explicit;
    const sourceName = normalize(example.source || example.contextSource || "");
    if (/tatoeba|tanaka|hkcan|corpus/.test(sourceName)) return "corpus";
    if (/manually audited|audited|override/.test(sourceName)) return "audited";
    if (/grammar instantiation|rule validated|validator/.test(sourceName)) return "validated";
    if (/generated/.test(sourceName)) return "generated";
    if (/aida/.test(sourceName)) return "curated";
    return "unverified";
  }

  function qualityKey(scope, kind, itemId, index, text) {
    return `${scope}:${kind}:${itemId}:${index}:${stableTextHash(text)}`;
  }

  function qualityReportFor(key) {
    return state.quality?.reports?.[key] || null;
  }

  function shouldHideQualityExample(key) {
    const report = qualityReportFor(key);
    return Boolean(state.quality?.hideReported && report?.hidden);
  }

  function registerQualityExample(meta) {
    qualityExampleRegistry.set(meta.key, meta);
    return meta.key;
  }

  function qualityBadgeHtml(status, key) {
    const reported = Boolean(qualityReportFor(key));
    return `<span class="quality-badge quality-${escapeHtml(status)}">${escapeHtml(QUALITY_LABELS[status] || titleCase(status))}</span>${reported ? '<span class="quality-badge quality-reported">REPORTED</span>' : ''}`;
  }

  function qualityControlsHtml(meta) {
    registerQualityExample(meta);
    const status = qualityStatusFor(meta);
    return `<div class="quality-controls">${qualityBadgeHtml(status, meta.key)}<button type="button" class="quality-report-button" data-report-example="${escapeHtml(meta.key)}">Report issue</button></div>`;
  }


  function jyutpingSyllables(reading) {
    return String(reading || "")
      .normalize("NFKC")
      .match(/[A-Za-z]+[0-9]/g) || [];
  }

  function cantoneseRubyHtml(text, reading) {
    const syllables = jyutpingSyllables(reading);
    if (!syllables.length) return escapeHtml(text);
    let syllableIndex = 0;
    const chunks = String(text || "").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\p{Script=Han}|[^A-Za-z\p{Script=Han}]+/gu) || [];
    return chunks.map(chunk => {
      if (/^\p{Script=Han}$/u.test(chunk) || /^[A-Za-z]/.test(chunk)) {
        const syllable = syllables[syllableIndex++] || "";
        return syllable ? `<ruby><rb>${escapeHtml(chunk)}</rb><rt>${escapeHtml(syllable)}</rt></ruby>` : escapeHtml(chunk);
      }
      return escapeHtml(chunk);
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
      version: 7,
      profile: {
        name: "Learner",
        jpTarget: "N5",
        yueTarget: "Beginner",
        jpDailyGoal: 30,
        yueDailyGoal: 30,
        fsrsRetention: 0.90
      },
      xp: { jp: 0, yue: 0 },
      activity: { jp: {}, yue: {} },
      // Item-level aggregate kept for fast dashboards and backwards-compatible exports.
      srs: {},
      // Independent memory states. One source item can have several active skill cards.
      skillSrs: {},
      sessions: { jp: 0, yue: 0 },
      answers: {
        jp: { correct: 0, wrong: 0 },
        yue: { correct: 0, wrong: 0 }
      },
      lastSession: null,
      preferredStudyLanguage: "jp",
      audio: { jpVoiceId: "", yueVoiceId: "", jpNeuralFirst: true },
      quality: { reports: {}, hideReported: true }
    };
  }

  function legacySkillForKey(key) {
    if (/^(jp|yue)C:/.test(key)) return "casual";
    if (/^(jp|yue)G:/.test(key)) return "grammar";
    if (/^(jp|yue)[SP]:/.test(key)) return "reading";
    return "recognition";
  }

  function serializeFsrsCard(card) {
    if (!card) return null;
    return {
      ...card,
      due: card.due instanceof Date ? card.due.getTime() : Number(card.due) || Date.now(),
      last_review: card.last_review instanceof Date ? card.last_review.getTime() : (card.last_review ? Number(card.last_review) : null)
    };
  }

  function hydrateFsrsCard(card) {
    if (!card) return null;
    return {
      ...card,
      due: new Date(Number(card.due) || Date.now()),
      last_review: card.last_review ? new Date(Number(card.last_review)) : undefined
    };
  }

  function legacyRecordFromAggregate(srs) {
    const seen = Number(srs?.seen) || Number(srs?.reps) || 0;
    if (!seen) return null;
    const interval = Math.max(0.001, Number(srs?.interval) || 0.2);
    const last = Number(srs?.last) || Date.now();
    const due = Number(srs?.due) || (last + interval * DAY);
    const card = {
      due,
      stability: Math.max(0.2, interval),
      difficulty: clamp(6 - ((Number(srs?.ease) || 2.5) - 2.5) * 1.8, 1, 10),
      elapsed_days: 0,
      scheduled_days: Math.max(0, Math.round(interval)),
      reps: Number(srs?.reps) || seen,
      lapses: Number(srs?.wrong) || 0,
      learning_steps: 0,
      state: (Number(srs?.reps) || 0) > 0 ? 2 : 1,
      last_review: last
    };
    return {
      card,
      seen,
      correct: Number(srs?.correct) || 0,
      wrong: Number(srs?.wrong) || 0,
      mastery: Number(srs?.mastery) || 0,
      last,
      lastRating: srs?.lastRating ?? null,
      history: []
    };
  }

  function migrateState(raw) {
    const fresh = defaultState();
    if (!raw || typeof raw !== "object") return fresh;

    // V4/V5 already had independent language tracks but only one memory score per item.
    if ([4, 5, 6, 7].includes(raw.version)) {
      const migrated = {
        ...fresh,
        ...raw,
        profile: { ...fresh.profile, ...(raw.profile || {}) },
        xp: { ...fresh.xp, ...(raw.xp || {}) },
        activity: {
          jp: { ...(raw.activity?.jp || {}) },
          yue: { ...(raw.activity?.yue || {}) }
        },
        srs: { ...(raw.srs || {}) },
        skillSrs: { ...(raw.skillSrs || {}) },
        sessions: { ...fresh.sessions, ...(raw.sessions || {}) },
        answers: {
          jp: { ...fresh.answers.jp, ...(raw.answers?.jp || {}) },
          yue: { ...fresh.answers.yue, ...(raw.answers?.yue || {}) }
        },
        audio: { ...fresh.audio, ...(raw.audio || {}) },
        quality: {
          ...fresh.quality,
          ...(raw.quality || {}),
          reports: { ...(raw.quality?.reports || {}) }
        },
        version: 7
      };
      if (!Object.keys(migrated.skillSrs).length) {
        Object.entries(migrated.srs).forEach(([key, srs]) => {
          const record = legacyRecordFromAggregate(srs);
          if (record) migrated.skillSrs[key] = { [legacySkillForKey(key)]: record };
        });
      }
      migrated.profile.fsrsRetention = clamp(Number(migrated.profile.fsrsRetention) || 0.90, 0.80, 0.97);
      return migrated;
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
    const migrated = {
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
    Object.entries(migrated.srs).forEach(([key, srs]) => {
      const record = legacyRecordFromAggregate(srs);
      if (record) migrated.skillSrs[key] = { [legacySkillForKey(key)]: record };
    });
    return migrated;
  }

  function loadState() {
    try {
      return migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  let fsrsSchedulerCache = null;
  let fsrsSchedulerRetention = null;

  function fsrsScheduler() {
    const retention = clamp(Number(state.profile?.fsrsRetention) || 0.90, 0.80, 0.97);
    if (!window.FSRS?.fsrs) return null;
    if (!fsrsSchedulerCache || fsrsSchedulerRetention !== retention) {
      fsrsSchedulerRetention = retention;
      fsrsSchedulerCache = window.FSRS.fsrs({
        request_retention: retention,
        maximum_interval: 36500,
        enable_fuzz: true,
        enable_short_term: true,
        learning_steps: ["1m", "10m"],
        relearning_steps: ["10m"]
      });
    }
    return fsrsSchedulerCache;
  }

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

  function skillsForEntry(entry) {
    const explicit = entry?.studySkills || entry?.item?.studySkills;
    if (Array.isArray(explicit) && explicit.length) return [...new Set(explicit.filter(skill => SKILLS.includes(skill)))];
    const mode = entry?.practiceMode || entry?.item?.practiceMode || entry?.contextMode;
    const base = sourceEntryFor(entry);
    if (mode === "listening" || mode === "listening-sentence" || mode === "listening-passage") return ["listening"];
    if (mode === "casual" || base.kind.endsWith("C")) return ["casual"];
    if (mode === "production") return base.kind.endsWith("G") ? ["production", "grammar"] : ["production"];
    if (entry?.kind?.endsWith("S") || entry?.kind?.endsWith("P")) return ["reading"];
    if (base.kind.endsWith("G")) return ["grammar"];
    return ["recognition"];
  }

  function primarySkillForEntry(entry) {
    return skillsForEntry(entry)[0] || "recognition";
  }

  function emptySkillRecord() {
    return { card: null, seen: 0, correct: 0, wrong: 0, mastery: 0, last: 0, lastRating: null, history: [] };
  }

  function skillRecordFor(key, skill, create = false) {
    const bucket = state.skillSrs[key];
    if (bucket?.[skill]) return bucket[skill];
    if (!create) return null;
    state.skillSrs[key] ||= {};
    state.skillSrs[key][skill] = emptySkillRecord();
    return state.skillSrs[key][skill];
  }

  function cardMastery(record) {
    if (!record?.seen || !record.card) return 0;
    const card = hydrateFsrsCard(record.card);
    const scheduler = fsrsScheduler();
    let retrievability = 0.75;
    try {
      if (scheduler && card?.state !== 0) retrievability = Number(scheduler.get_retrievability(card, new Date(), false));
    } catch { /* use conservative fallback */ }
    if (!Number.isFinite(retrievability)) retrievability = 0.75;
    const stability = Math.max(0, Number(card?.stability) || 0);
    const stabilityStrength = 1 - Math.exp(-stability / 21);
    return clamp(Math.round((retrievability * 0.58 + stabilityStrength * 0.42) * 100), 0, 100);
  }

  function fallbackScheduleCard(record, rating, now = Date.now()) {
    const previous = record.card || {};
    const reps = (Number(previous.reps) || 0) + 1;
    const oldStability = Math.max(0.2, Number(previous.stability) || 0.2);
    const multipliers = { 1: 0.35, 2: 1.2, 4: 2.4, 5: 4.5 };
    const stability = rating === 1 ? Math.max(0.2, oldStability * 0.35) : Math.max(0.5, oldStability * (multipliers[rating] || 2));
    const intervalDays = rating === 1 ? 1 / 1440 : rating === 2 ? 10 / 1440 : Math.max(1, Math.round(stability * (rating === 5 ? 1.35 : 0.9)));
    return {
      due: now + intervalDays * DAY,
      stability,
      difficulty: clamp((Number(previous.difficulty) || 5) + (rating === 1 ? 0.6 : rating === 2 ? 0.15 : rating === 5 ? -0.25 : -0.08), 1, 10),
      elapsed_days: 0,
      scheduled_days: Math.max(0, Math.round(intervalDays)),
      reps,
      lapses: (Number(previous.lapses) || 0) + (rating === 1 ? 1 : 0),
      learning_steps: 0,
      state: intervalDays >= 1 ? 2 : 1,
      last_review: now
    };
  }

  function scheduleSkill(key, skill, rating) {
    const record = { ...emptySkillRecord(), ...(skillRecordFor(key, skill, true) || {}) };
    const now = new Date();
    const scheduler = fsrsScheduler();
    let nextCard;
    if (scheduler && window.FSRS?.createEmptyCard) {
      try {
        const currentCard = record.card ? hydrateFsrsCard(record.card) : window.FSRS.createEmptyCard();
        nextCard = scheduler.next(currentCard, now, UI_TO_FSRS_RATING[rating] || window.FSRS.Rating.Good).card;
      } catch (error) {
        console.warn("FSRS scheduling fallback", error);
        nextCard = fallbackScheduleCard(record, rating, now.getTime());
      }
    } else nextCard = fallbackScheduleCard(record, rating, now.getTime());

    record.card = serializeFsrsCard(nextCard);
    record.seen = (Number(record.seen) || 0) + 1;
    record.correct = (Number(record.correct) || 0) + (rating > 1 ? 1 : 0);
    record.wrong = (Number(record.wrong) || 0) + (rating <= 1 ? 1 : 0);
    record.last = now.getTime();
    record.lastRating = rating;
    record.mastery = cardMastery(record);
    record.history = [...(record.history || []), { at: now.getTime(), rating, due: Number(record.card?.due) || now.getTime(), stability: Number(record.card?.stability) || 0, difficulty: Number(record.card?.difficulty) || 0 }].slice(-60);
    state.skillSrs[key][skill] = record;
    return record;
  }

  function aggregateSrsForKey(key) {
    const records = Object.values(state.skillSrs[key] || {}).filter(record => (Number(record?.seen) || 0) > 0);
    if (!records.length) return state.srs[key] || null;
    const lastRecord = [...records].sort((a, b) => (Number(b.last) || 0) - (Number(a.last) || 0))[0];
    const dueValues = records.map(record => Number(record.card?.due) || Date.now());
    const aggregate = {
      interval: Math.max(0, ...records.map(record => Number(record.card?.scheduled_days) || 0)),
      reps: records.reduce((sum, record) => sum + (Number(record.card?.reps) || 0), 0),
      due: Math.min(...dueValues),
      seen: records.reduce((sum, record) => sum + (Number(record.seen) || 0), 0),
      correct: records.reduce((sum, record) => sum + (Number(record.correct) || 0), 0),
      wrong: records.reduce((sum, record) => sum + (Number(record.wrong) || 0), 0),
      mastery: Math.round(records.reduce((sum, record) => sum + (Number(record.mastery) || 0), 0) / records.length),
      last: Number(lastRecord?.last) || 0,
      lastRating: lastRecord?.lastRating ?? null,
      skills: Object.keys(state.skillSrs[key] || {}).filter(skill => (state.skillSrs[key][skill]?.seen || 0) > 0)
    };
    state.srs[key] = aggregate;
    return aggregate;
  }

  function refreshAllAggregates() {
    Object.keys(state.skillSrs || {}).forEach(aggregateSrsForKey);
  }

  refreshAllAggregates();

  function scheduleEntry(entry, rating, options = {}) {
    const base = sourceEntryFor(entry);
    const key = itemKey(base.kind, base.item);
    const skills = skillsForEntry(entry);
    skills.forEach(skill => scheduleSkill(key, skill, rating));
    const aggregate = aggregateSrsForKey(key);
    if (options.award !== false) {
      const lang = langFromKind(base.kind);
      state.xp[lang] += XP_AWARDS[rating] || 0;
      markActivity(lang, 1);
    }
    return aggregate;
  }

  function srsFor(key) {
    return state.srs[key] || {
      interval: 0,
      reps: 0,
      due: Date.now(),
      seen: 0,
      correct: 0,
      wrong: 0,
      mastery: 0,
      last: 0,
      lastRating: null,
      skills: []
    };
  }

  function markActivity(lang, points = 1) {
    const key = todayKey();
    state.activity[lang][key] = (state.activity[lang][key] || 0) + points;
  }

  // Compatibility wrapper for older internal call sites.
  function schedule(kind, item, rating) {
    return scheduleEntry({ kind, item }, rating);
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

  function skillMasteryForKey(key, skill) {
    return Number(skillRecordFor(key, skill)?.mastery) || 0;
  }

  function languageSkillMastery(lang, skill) {
    const prefix = lang === "jp" ? "jp" : "yue";
    const records = Object.entries(state.skillSrs || {})
      .filter(([key]) => key.startsWith(prefix))
      .map(([, bucket]) => bucket?.[skill])
      .filter(record => (record?.seen || 0) > 0);
    if (!records.length) return 0;
    return Math.round(records.reduce((sum, record) => sum + (Number(record.mastery) || 0), 0) / records.length);
  }

  function languageMastery(lang) {
    const activeSkills = SKILLS.map(skill => languageSkillMastery(lang, skill)).filter(value => value > 0);
    if (!activeSkills.length) return 0;
    return Math.round(activeSkills.reduce((sum, value) => sum + value, 0) / activeSkills.length);
  }

  function dueSkillForKey(key) {
    const now = Date.now();
    const records = Object.entries(state.skillSrs[key] || {})
      .filter(([, record]) => (record?.seen || 0) > 0)
      .map(([skill, record]) => ({ skill, record, due: Number(record.card?.due) || now, mastery: Number(record.mastery) || 0 }));
    if (!records.length) return "recognition";
    records.sort((a, b) => {
      const aDue = a.due <= now ? 0 : 1;
      const bDue = b.due <= now ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      if (a.due !== b.due) return a.due - b.due;
      return a.mastery - b.mastery;
    });
    return records[0].skill;
  }

  function formatDueInterval(ms) {
    const minutes = Math.max(1, Math.round(ms / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.round(days / 30);
    if (months < 24) return `${months}mo`;
    return `${Math.round(months / 12)}y`;
  }

  function fsrsRatingPreview(entry, skill = primarySkillForEntry(entry)) {
    const base = sourceEntryFor(entry);
    const key = itemKey(base.kind, base.item);
    const record = skillRecordFor(key, skill);
    const scheduler = fsrsScheduler();
    const now = new Date();
    const fallback = { 1: "1m", 2: "10m", 4: "1d", 5: "4d" };
    if (!scheduler || !window.FSRS?.createEmptyCard) return fallback;
    try {
      const card = record?.card ? hydrateFsrsCard(record.card) : window.FSRS.createEmptyCard();
      const preview = scheduler.repeat(card, now);
      return {
        1: formatDueInterval(preview[window.FSRS.Rating.Again].card.due - now),
        2: formatDueInterval(preview[window.FSRS.Rating.Hard].card.due - now),
        4: formatDueInterval(preview[window.FSRS.Rating.Good].card.due - now),
        5: formatDueInterval(preview[window.FSRS.Rating.Easy].card.due - now)
      };
    } catch {
      return fallback;
    }
  }

  function renderRatingPreviews(entry, selector = "[data-rating]") {
    const preview = fsrsRatingPreview(entry);
    const labels = { 1: "Again", 2: "Hard", 4: "Good", 5: "Easy" };
    $$(selector).forEach(button => {
      const rating = Number(button.dataset.rating || button.dataset.reviewRating);
      if (!rating) return;
      button.innerHTML = `<span>${labels[rating]}</span><small>${escapeHtml(preview[rating] || "")}</small>`;
    });
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
    if (kind === "jpC" || kind === "yueC") return item.casual || item.base || item.title || "";
    if (kind === "jpG" || kind === "yueG") return humanizeTemplate(item.pattern, item);
    if (isComprehensionKind(kind)) return item.text || "";
    return kind === "jpV" ? item.expression : item.word;
  }

  function humanizedReading(kind, item) {
    if (kind === "jpV") return item.reading || "";
    if (kind === "yueV") return item.jyutping || "";
    if (kind === "jpC" || kind === "yueC") return item.reading || "";
    if (kind === "yueG") return humanizeTemplate(item.jyutping || "", item);
    if (isComprehensionKind(kind)) return item.reading || "";
    return "";
  }

  function meaningOf(item) {
    return item.translation || item.meaning || "";
  }

  function yueVocabLevel(item) {
    if (YUE_LEVELS.includes(item?.level)) return item.level;
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
    if (tags.includes("AIDA_Everyday_Core")) return "Everyday core";
    if (tags.includes("Genki")) return "Genki";
    if (tags.includes("Intermediate_Japanese")) return "Intermediate Japanese";
    if (tags.includes("JLPT")) return "JLPT core";
    return "Other";
  }

  function itemTopics(kind, item) {
    if (kind !== "jpV" && kind !== "yueV") return [];
    const topics = Array.isArray(item?.topics) ? item.topics : [];
    return [...new Set(topics.map(value => String(value || "").trim()).filter(Boolean))];
  }

  function cantoneseVocabBand(item) {
    const rank = Number(item.frequency_rank) || Infinity;
    if (rank <= 1000) return "Top 1,000";
    if (rank <= 3000) return "Core 1,001–3,000";
    if (rank <= 12000) return "Common 3,001–12,000";
    return "Extended 12,001+";
  }

  function itemCategory(kind, item) {
    if (kind === "jpC" || kind === "yueC") return "Casual conversation";
    if (kind === "jpG" || kind === "yueG") return titleCase(item.category || "General");
    if (kind === "jpV") return itemTopics(kind, item)[0] || japaneseVocabCollection(item);
    if (kind === "yueV") return itemTopics(kind, item)[0] || cantoneseVocabBand(item);
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
    const topics = itemTopics(kind, item);
    const parts = [itemLevel(kind, item), ...(topics.length ? topics.slice(0, 2) : [itemCategory(kind, item)])];
    if (kind === "jpV") parts.push(japaneseVocabCollection(item));
    if (kind === "yueG" && item.register) parts.push(`${titleCase(item.register)} register`);
    if (kind === "yueV" && item.frequency_rank) parts.push(`Frequency #${Number(item.frequency_rank).toLocaleString()}`);
    return [...new Set(parts.filter(Boolean))];
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
    if (kind === "jpG") return [
      ...(GRAMMAR_OVERRIDES.japanese?.[item.id] || []),
      ...(CONTEXT.japanese?.grammar?.[item.id] || [])
    ];
    if (kind === "yueG") return [
      ...(GRAMMAR_OVERRIDES.cantonese?.[item.id] || [])
    ];
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
        translation: example.translation || "",
        source: example.source || "HKCanCor via PyCantonese"
      })).filter(example => example.text && example.translation);
      return [...bundled, ...corpus];
    }
    return [];
  }


  const JP_CURATED_GRAMMAR_CONTEXTS = {
    "い-adjectives": [
      { text: "この本は面白い。", translation: "This book is interesting.", source: "AIDA validated grammar example" },
      { text: "今日は昨日より暑いです。", translation: "Today is hotter than yesterday.", source: "AIDA validated grammar example" },
      { text: "その問題は難しくない。", translation: "That problem is not difficult.", source: "AIDA validated grammar example" }
    ],
    "な-adjectives": [
      { text: "この町は静かだ。", translation: "This town is quiet.", source: "AIDA validated grammar example" },
      { text: "便利なアプリを使っています。", translation: "I use a convenient app.", source: "AIDA validated grammar example" },
      { text: "彼はとても親切です。", translation: "He is very kind.", source: "AIDA validated grammar example" }
    ],
    "る-Verbs": [
      { text: "毎朝パンを食べる。", translation: "I eat bread every morning.", source: "AIDA validated grammar example" },
      { text: "夜十一時に寝る。", translation: "I go to sleep at eleven at night.", source: "AIDA validated grammar example" },
      { text: "駅で友達を見る。", translation: "I see a friend at the station.", source: "AIDA validated grammar example" }
    ],
    "う-Verbs": [
      { text: "毎日日記を書く。", translation: "I write a diary every day.", source: "AIDA validated grammar example" },
      { text: "週末に友達と話す。", translation: "I talk with friends on weekends.", source: "AIDA validated grammar example" },
      { text: "朝七時に起きる前に水を飲む。", translation: "I drink water before getting up at seven.", source: "AIDA validated grammar example" }
    ]
  };

  function japaneseClassGrammarContexts(item) {
    const slug = String(item.slug || "");
    const pattern = String(item.pattern || "");
    const combined = `${slug} ${pattern} ${item.meaning || ""}`;
    if (slug === "い-adjectives" || /い-?Adjectives?/i.test(pattern)) return JP_CURATED_GRAMMAR_CONTEXTS["い-adjectives"];
    if (slug === "な-adjectives" || /な-?Adjectives?/i.test(pattern)) return JP_CURATED_GRAMMAR_CONTEXTS["な-adjectives"];
    if (slug === "る-Verbs" || /る-?Verb\s*\(Dictionary\)/i.test(pattern)) return JP_CURATED_GRAMMAR_CONTEXTS["る-Verbs"];
    if (slug === "う-Verbs" || /う-?Verb\s*\(Dictionary\)/i.test(pattern)) return JP_CURATED_GRAMMAR_CONTEXTS["う-Verbs"];
    if (/い.?Adjective/i.test(combined) && /くない|Negative/i.test(combined)) return [
      { text: "この部屋は広くない。", translation: "This room is not spacious.", source: "AIDA validated grammar example" },
      { text: "今日は寒くないです。", translation: "It is not cold today.", source: "AIDA validated grammar example" },
      { text: "その映画はあまり面白くなかった。", translation: "That movie was not very interesting.", source: "AIDA validated grammar example" }
    ];
    if (/い.?Adjective/i.test(combined) && /かった|Past/i.test(combined)) return [
      { text: "昨日は暑かった。", translation: "It was hot yesterday.", source: "AIDA validated grammar example" },
      { text: "旅行は楽しかったです。", translation: "The trip was fun.", source: "AIDA validated grammar example" },
      { text: "試験は思ったより難しかった。", translation: "The exam was harder than I expected.", source: "AIDA validated grammar example" }
    ];
    if (/い.?Adjective/i.test(combined) && /く Change|Adverb|く\b/i.test(combined)) return [
      { text: "もっと早く歩いてください。", translation: "Please walk faster.", source: "AIDA validated grammar example" },
      { text: "部屋を明るくした。", translation: "I made the room brighter.", source: "AIDA validated grammar example" },
      { text: "野菜を小さく切ります。", translation: "I cut the vegetables small.", source: "AIDA validated grammar example" }
    ];
    if (/な.?Adjective/i.test(combined) && /に Change|Adverb|に\b/i.test(combined)) return [
      { text: "静かに話してください。", translation: "Please speak quietly.", source: "AIDA validated grammar example" },
      { text: "部屋をきれいにしました。", translation: "I made the room clean.", source: "AIDA validated grammar example" },
      { text: "もっと簡単に説明します。", translation: "I will explain it more simply.", source: "AIDA validated grammar example" }
    ];
    return [];
  }

  function grammarLiteralCandidates(kind, item) {
    const raw = String(item.pattern || "").replace(/[\[\](){}]/g, " ");
    const parts = raw.includes("→") ? raw.split("→").reverse() : [raw];
    const stop = new Set(["辞書形", "ます形", "普通形", "動詞", "名詞", "形容詞", "文", "節", "長音", "助詞", "命令形", "他動詞", "自動詞"]);
    const chunks = parts.flatMap(part => part.match(/[ぁ-んァ-ヶ一-龠々〆ヵヶ]+/g) || []);
    return [...new Set(chunks.map(x => x.replace(/[～〜]/g, "").trim()).filter(x => x && !stop.has(x)))].sort((a,b)=>b.length-a.length);
  }

  function japaneseParticleContextMatches(sentence, particle) {
    const curated = {
      "は": /(?:私|今日|これ|それ|彼|彼女|この\S+|その\S+)は/,
      "が": /(?:誰|何|雨|風|人|友達|彼|彼女|猫|犬)が/,
      "を": /(?:本|ご飯|水|映画|音楽|仕事|宿題|コーヒー|何)を/,
      "に": /(?:駅|学校|会社|家|東京|時間|ため|前|後)に/,
      "で": /(?:駅|学校|会社|家|電車|バス|日本語)で/,
      "へ": /(?:駅|学校|会社|家|東京)へ/,
      "と": /(?:友達|家族|先生|彼|彼女)と|と言/,
      "も": /(?:私|今日|これ|それ|彼|彼女)も/,
      "の": /\Sの\S/,
      "か": /か[。！？?]?$/
    };
    return curated[particle] ? curated[particle].test(sentence) : sentence.includes(particle);
  }

  function grammarContextMatches(kind, item, candidate) {
    const text = String(candidate?.text || "");
    if (!text) return false;
    if (candidate?.auditVerified === true || candidate?.source === "AIDA audited grammar override") return true;
    if (kind === "jpG") {
      const classExamples = japaneseClassGrammarContexts(item);
      if (classExamples.length) return classExamples.some(example => example.text === text);
      const literals = grammarLiteralCandidates(kind, item);
      if (!literals.length) return false;
      const meaningful = literals.filter(token => token.length >= 2);
      if (meaningful.length) return meaningful.some(token => text.includes(token));
      if (literals.length === 1) return japaneseParticleContextMatches(text, literals[0]);
      return literals.some(token => text.includes(token));
    }
    if (kind === "yueG") {
      const literals = grammarLiteralCandidates(kind, item).filter(token => token.length >= 1);
      if (!literals.length) return false;
      const long = literals.filter(token => token.length >= 2);
      return (long.length ? long : literals).some(token => text.includes(token));
    }
    return true;
  }

  function everydayVocabularyContexts(kind, item) {
    if (kind !== "jpV" && kind !== "yueV") return [];
    const topics = new Set(itemTopics(kind, item));
    if (!topics.size) return [];
    const edible = ["Vegetables", "Fruit", "Food & ingredients", "Drinks"].some(topic => topics.has(topic));
    const animals = topics.has("Animals");
    const vehicles = topics.has("Vehicles & transport");
    const objectLike = ["Home & furniture", "Kitchen & dining", "Bathroom & hygiene", "Clothing & accessories", "Electronics & appliances", "Tools & repair", "Cleaning & laundry", "School & study", "Office & work"].some(topic => topics.has(topic));
    const gloss = String(item.meaning || "").split(/[;,/]/)[0].trim();
    if (kind === "jpV") {
      const target = item.expression || "";
      if (edible) return [
        { text: `スーパーで${target}を買いました。`, translation: `I bought ${gloss || target} at the supermarket.`, source: "AIDA everyday-topic context" },
        { text: `${target}を切って、夕飯の料理に入れました。`, translation: `I cut the ${gloss || target} and added it to dinner.`, source: "AIDA everyday-topic context" },
        { text: `今日は${target}を使って料理しました。`, translation: `Today I cooked using ${gloss || target}.`, source: "AIDA everyday-topic context" }
      ];
      if (animals) return [
        { text: `公園で${target}を見ました。`, translation: `I saw a ${gloss || target} in the park.`, source: "AIDA everyday-topic context" },
        { text: `子どもが${target}を見て喜びました。`, translation: `The child was happy to see the ${gloss || target}.`, source: "AIDA everyday-topic context" },
        { text: `写真を撮ろうとしたら、${target}がすぐに動きました。`, translation: `When I tried to take a picture, the ${gloss || target} moved right away.`, source: "AIDA everyday-topic context" }
      ];
      if (vehicles) return [
        { text: `駅の近くで${target}を見ました。`, translation: `I saw a ${gloss || target} near the station.`, source: "AIDA everyday-topic context" },
        { text: `今日は${target}を使って移動しました。`, translation: `Today I traveled using ${gloss || target}.`, source: "AIDA everyday-topic context" },
        { text: `道路が混んでいて、${target}もゆっくり進んでいました。`, translation: `The road was crowded, and the ${gloss || target} was moving slowly too.`, source: "AIDA everyday-topic context" }
      ];
      if (objectLike) return [
        { text: `新しい${target}を買いました。`, translation: `I bought a new ${gloss || target}.`, source: "AIDA everyday-topic context" },
        { text: `${target}は家の中の決まった場所に置いてあります。`, translation: `The ${gloss || target} is kept in its usual place at home.`, source: "AIDA everyday-topic context" },
        { text: `必要なときにすぐ使えるように、${target}を手の届く場所に置いています。`, translation: `I keep the ${gloss || target} within reach so I can use it when needed.`, source: "AIDA everyday-topic context" }
      ];
    } else {
      const word = item.word || "";
      const jy = item.jyutping || "";
      if (edible) return [
        { text: `我喺超級市場買咗${word}。`, reading: `ngo5 hai2 ciu1 kap1 si5 coeng4 maai5 zo2 ${jy}.`, translation: `I bought ${gloss || word} at the supermarket.`, source: "AIDA everyday-topic context" },
        { text: `我切好${word}之後，就放落餸入面。`, reading: `ngo5 cit3 hou2 ${jy} zi1 hau6, zau6 fong3 lok6 sung3 jap6 min6.`, translation: `After cutting the ${gloss || word}, I added it to the dish.`, source: "AIDA everyday-topic context" },
        { text: `我今日用${word}煮晚餐。`, reading: `ngo5 gam1 jat6 jung6 ${jy} zyu2 maan5 caan1.`, translation: `Today I cooked dinner using ${gloss || word}.`, source: "AIDA everyday-topic context" }
      ];
      if (animals) return [
        { text: `我喺公園見到${word}。`, reading: `ngo5 hai2 gung1 jyun2 gin3 dou3 ${jy}.`, translation: `I saw a ${gloss || word} in the park.`, source: "AIDA everyday-topic context" },
        { text: `個細路見到${word}之後好開心。`, reading: `go3 sai3 lou6 gin3 dou3 ${jy} zi1 hau6 hou2 hoi1 sam1.`, translation: `The child was very happy after seeing the ${gloss || word}.`, source: "AIDA everyday-topic context" },
        { text: `我想影相嗰陣，${word}突然郁咗。`, reading: `ngo5 soeng2 jing2 soeng2 go2 zan6, ${jy} dat6 jin4 juk1 zo2.`, translation: `When I wanted to take a photo, the ${gloss || word} suddenly moved.`, source: "AIDA everyday-topic context" }
      ];
      if (vehicles) return [
        { text: `我喺車站附近見到${word}。`, reading: `ngo5 hai2 ce1 zaam6 fu6 gan6 gin3 dou3 ${jy}.`, translation: `I saw a ${gloss || word} near the station.`, source: "AIDA everyday-topic context" },
        { text: `我今日搭${word}去另一區。`, reading: `ngo5 gam1 jat6 daap3 ${jy} heoi3 ling6 jat1 keoi1.`, translation: `Today I took the ${gloss || word} to another district.`, source: "AIDA everyday-topic context" },
        { text: `條路好塞，${word}都行得好慢。`, reading: `tiu4 lou6 hou2 sak1, ${jy} dou1 haang4 dak1 hou2 maan6.`, translation: `The road was congested, so the ${gloss || word} was moving very slowly too.`, source: "AIDA everyday-topic context" }
      ];
      if (objectLike) return [
        { text: `我新買咗${word}。`, reading: `ngo5 san1 maai5 zo2 ${jy}.`, translation: `I bought a new ${gloss || word}.`, source: "AIDA everyday-topic context" },
        { text: `我將${word}放喺屋企固定嘅位置。`, reading: `ngo5 zoeng1 ${jy} fong3 hai2 uk1 kei2 gu3 ding6 ge3 wai6 zi3.`, translation: `I keep the ${gloss || word} in a fixed place at home.`, source: "AIDA everyday-topic context" },
        { text: `為咗需要嗰陣即刻用到，我將${word}放喺容易拎到嘅地方。`, reading: `wai6 zo2 seoi1 jiu3 go2 zan6 zik1 hak1 jung6 dou2, ngo5 zoeng1 ${jy} fong3 hai2 jung4 ji6 ling1 dou2 ge3 dei6 fong1.`, translation: `I keep the ${gloss || word} somewhere easy to reach so I can use it immediately when needed.`, source: "AIDA everyday-topic context" }
      ];
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
      const everyday = everydayVocabularyContexts(kind, item);
      if (!looksVerb && !looksAdjective && everyday.length) return everyday;
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
    const classContexts = japaneseClassGrammarContexts(item);
    if (classContexts.length) return classContexts;
    // Do not invent a sentence merely because it contains the same characters as a
    // grammar label. Unverified grammar cards intentionally show no context tile.
    return [];
  }

  const YUE_PLACEHOLDER_SETS = [
    { A: "我", B: "學生", S: "我", O: "呢本書", X: "今日", Y: "聽日", SUBJECT: "我", PLACE: "屋企", CLASSIFIER: "個", PRONOUN: "我", "DIRECT OBJECT": "呢本書", "INDIRECT OBJECT": "朋友", CLAUSE: "我今日返工", LOCATION: "屋企", TIME: "今日", PERSON: "朋友", SOURCE: "公司", VP: "食飯", PHRASE: "好快", "REDUPLICATED ADVERB": "慢慢", RESULT: "好攰", NUMBER: "三", "STATIVE VERB": "鍾意", "RELATIVE CLAUSE": "我昨日買", YEAR: "二零二六", MONTH: "七", DAY: "十一", HOUR: "三", MINUTES: "十五", DURATION: "兩", REQUEST: "幫我開門", VERB: "食", V: "食", NOUN: "朋友", N: "朋友", ADJ: "開心", CL: "個" },
    { A: "佢", B: "老師", S: "佢", O: "杯茶", X: "朝早", Y: "夜晚", SUBJECT: "佢", PLACE: "公司", CLASSIFIER: "本", PRONOUN: "佢", "DIRECT OBJECT": "杯茶", "INDIRECT OBJECT": "阿媽", CLAUSE: "佢聽日放假", LOCATION: "公司", TIME: "朝早", PERSON: "阿媽", SOURCE: "學校", VP: "返工", PHRASE: "好清楚", "REDUPLICATED ADVERB": "快快", RESULT: "好開心", NUMBER: "兩", "STATIVE VERB": "明白", "RELATIVE CLAUSE": "佢頭先講", YEAR: "二零二五", MONTH: "十二", DAY: "二十四", HOUR: "八", MINUTES: "三十", DURATION: "三", REQUEST: "畀杯水我", VERB: "講", V: "講", NOUN: "工作", N: "工作", ADJ: "方便", CL: "本" },
    { A: "我哋", B: "香港人", S: "我哋", O: "個問題", X: "而家", Y: "下次", SUBJECT: "我哋", PLACE: "學校", CLASSIFIER: "件", PRONOUN: "我哋", "DIRECT OBJECT": "個問題", "INDIRECT OBJECT": "老師", CLAUSE: "我哋學緊廣東話", LOCATION: "學校", TIME: "而家", PERSON: "老師", SOURCE: "屋企", VP: "學廣東話", PHRASE: "好自然", "REDUPLICATED ADVERB": "靜靜", RESULT: "好成功", NUMBER: "五", "STATIVE VERB": "需要", "RELATIVE CLAUSE": "我哋一齊做", YEAR: "二零二四", MONTH: "三", DAY: "一", HOUR: "十", MINUTES: "四十五", DURATION: "一", REQUEST: "再講一次", VERB: "做", V: "做", NOUN: "方法", N: "方法", ADJ: "重要", CL: "件" }
  ];
  const YUE_JYUTPING_PLACEHOLDER_SETS = [
    { A: "ngo5", B: "hok6 saang1", S: "ngo5", O: "ni1 bun2 syu1", X: "gam1 jat6", Y: "ting1 jat6", SUBJECT: "ngo5", PLACE: "uk1 kei2", CLASSIFIER: "go3", PRONOUN: "ngo5", "DIRECT OBJECT": "ni1 bun2 syu1", "INDIRECT OBJECT": "pang4 jau5", CLAUSE: "ngo5 gam1 jat6 faan1 gung1", LOCATION: "uk1 kei2", TIME: "gam1 jat6", PERSON: "pang4 jau5", SOURCE: "gung1 si1", VP: "sik6 faan6", PHRASE: "hou2 faai3", "REDUPLICATED ADVERB": "maan6 maan6", RESULT: "hou2 gui6", NUMBER: "saam1", "STATIVE VERB": "zung1 ji3", "RELATIVE CLAUSE": "ngo5 zok6 jat6 maai5", YEAR: "ji6 ling4 ji6 luk6", MONTH: "cat1", DAY: "sap6 jat1", HOUR: "saam1", MINUTES: "sap6 ng5", DURATION: "loeng5", REQUEST: "bong1 ngo5 hoi1 mun4", VERB: "sik6", V: "sik6", NOUN: "pang4 jau5", N: "pang4 jau5", ADJ: "hoi1 sam1", CL: "go3" },
    { A: "keoi5", B: "lou5 si1", S: "keoi5", O: "bui1 caa4", X: "ziu1 zou2", Y: "je6 maan5", SUBJECT: "keoi5", PLACE: "gung1 si1", CLASSIFIER: "bun2", PRONOUN: "keoi5", "DIRECT OBJECT": "bui1 caa4", "INDIRECT OBJECT": "aa3 maa1", CLAUSE: "keoi5 ting1 jat6 fong3 gaa3", LOCATION: "gung1 si1", TIME: "ziu1 zou2", PERSON: "aa3 maa1", SOURCE: "hok6 haau6", VP: "faan1 gung1", PHRASE: "hou2 cing1 co2", "REDUPLICATED ADVERB": "faai3 faai3", RESULT: "hou2 hoi1 sam1", NUMBER: "loeng5", "STATIVE VERB": "ming4 baak6", "RELATIVE CLAUSE": "keoi5 tau4 sin1 gong2", YEAR: "ji6 ling4 ji6 ng5", MONTH: "sap6 ji6", DAY: "ji6 sap6 sei3", HOUR: "baat3", MINUTES: "saam1 sap6", DURATION: "saam1", REQUEST: "bei2 bui1 seoi2 ngo5", VERB: "gong2", V: "gong2", NOUN: "gung1 zok3", N: "gung1 zok3", ADJ: "fong1 bin6", CL: "bun2" },
    { A: "ngo5 dei6", B: "hoeng1 gong2 jan4", S: "ngo5 dei6", O: "go3 man6 tai4", X: "ji4 gaa1", Y: "haa6 ci3", SUBJECT: "ngo5 dei6", PLACE: "hok6 haau6", CLASSIFIER: "gin6", PRONOUN: "ngo5 dei6", "DIRECT OBJECT": "go3 man6 tai4", "INDIRECT OBJECT": "lou5 si1", CLAUSE: "ngo5 dei6 hok6 gan2 gwong2 dung1 waa2", LOCATION: "hok6 haau6", TIME: "ji4 gaa1", PERSON: "lou5 si1", SOURCE: "uk1 kei2", VP: "hok6 gwong2 dung1 waa2", PHRASE: "hou2 zi6 jin4", "REDUPLICATED ADVERB": "zing6 zing6", RESULT: "hou2 sing4 gung1", NUMBER: "ng5", "STATIVE VERB": "seoi1 jiu3", "RELATIVE CLAUSE": "ngo5 dei6 jat1 cai4 zou6", YEAR: "ji6 ling4 ji6 sei3", MONTH: "saam1", DAY: "jat1", HOUR: "sap6", MINUTES: "sei3 sap6 ng5", DURATION: "jat1", REQUEST: "zoi3 gong2 jat1 ci3", VERB: "zou6", V: "zou6", NOUN: "fong1 faat3", N: "fong1 faat3", ADJ: "zung6 jiu3", CL: "gin6" }
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
    const everyday = everydayVocabularyContexts(kind, item);
    if (!looksVerb && !looksAdjective && everyday.length) return everyday;
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
      if (kind.endsWith("G") && !grammarContextMatches(kind, item, candidate)) continue;
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

  function deterministicHash(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  const COHERENT_SCENES = {
    jp: {
      general: { text: "今日、身近な出来事について考えることがありました。", translation: "Today, something in everyday life gave me a reason to think." },
      food: { text: "昼ごろ、友達と食事の話をしていました。", translation: "Around noon, I was talking with a friend about food." },
      movement: { text: "出かける前に、今日の予定を確認しました。", translation: "Before going out, I checked today's plans." },
      people: { text: "友達と話していると、ある出来事の話になりました。", translation: "While talking with a friend, the conversation turned to something that had happened." },
      time: { text: "予定を確認していると、時間の使い方が話題になりました。", translation: "While checking the schedule, we started talking about how time was being used." },
      work: { text: "仕事が終わったあと、今日の出来事を振り返りました。", translation: "After work, I looked back on what had happened that day." },
      body: { text: "体調のことが気になって、少し立ち止まって考えました。", translation: "I was concerned about my condition, so I stopped to think for a moment." },
      money: { text: "買い物の前に、何を優先するか考えていました。", translation: "Before shopping, I was thinking about what to prioritize." },
      communication: { text: "会話の途中で、言葉の受け取り方について考えることがありました。", translation: "During a conversation, I found myself thinking about how words can be understood." },
      home: { text: "家で過ごしているとき、身近なことが話題になりました。", translation: "While spending time at home, an everyday matter came up." },
      nature: { text: "外の様子を見ながら、その日の出来事について話していました。", translation: "While looking outside, we talked about what had happened that day." }
    },
    yue: {
      general: { text: "今日有件身邊嘅事令我停低諗咗一陣。", reading: "gam1 jat6 jau5 gin6 san1 bin1 ge3 si6 ling6 ngo5 ting4 dai1 nam2 zo2 jat1 zan6.", translation: "Something close to me today made me stop and think for a while." },
      food: { text: "中午嗰陣，我同朋友傾緊食嘢嘅事。", reading: "zung1 ng5 go2 zan6, ngo5 tung4 pang4 jau5 king1 gan2 sik6 je5 ge3 si6.", translation: "Around noon, I was talking with a friend about food." },
      movement: { text: "出門口之前，我睇咗一次今日嘅安排。", reading: "ceot1 mun4 hau2 zi1 cin4, ngo5 tai2 zo2 jat1 ci3 gam1 jat6 ge3 on1 paai4.", translation: "Before going out, I checked today's plans once more." },
      people: { text: "我同朋友傾偈嗰陣，講起一件最近發生嘅事。", reading: "ngo5 tung4 pang4 jau5 king1 gai2 go2 zan6, gong2 hei2 jat1 gin6 zeoi3 gan6 faat3 sang1 ge3 si6.", translation: "While chatting with a friend, we brought up something that happened recently." },
      time: { text: "我哋睇緊行程嗰陣，開始傾點樣安排時間。", reading: "ngo5 dei6 tai2 gan2 hang4 cing4 go2 zan6, hoi1 ci2 king1 dim2 joeng6 on1 paai4 si4 gaan3.", translation: "While looking at the schedule, we started talking about how to arrange our time." },
      work: { text: "收工之後，我諗返今日發生嘅事。", reading: "sau1 gung1 zi1 hau6, ngo5 nam2 faan1 gam1 jat6 faat3 sang1 ge3 si6.", translation: "After work, I thought back over what happened today." },
      body: { text: "我有啲擔心自己嘅狀態，所以停低諗清楚先。", reading: "ngo5 jau5 di1 daam1 sam1 zi6 gei2 ge3 zong6 taai3, so2 ji5 ting4 dai1 nam2 cing1 co2 sin1.", translation: "I was a little worried about my condition, so I stopped to think it through first." },
      money: { text: "買嘢之前，我先諗清楚邊樣最值得。", reading: "maai5 je5 zi1 cin4, ngo5 sin1 nam2 cing1 co2 bin1 joeng6 zeoi3 zik6 dak1.", translation: "Before buying anything, I first thought about what was most worthwhile." },
      communication: { text: "傾偈傾到一半，我開始留意大家點樣理解同一句說話。", reading: "king1 gai2 king1 dou3 jat1 bun3, ngo5 hoi1 ci2 lau4 ji3 daai6 gaa1 dim2 joeng6 lei5 gaai2 tung4 jat1 geoi3 syut3 waa6.", translation: "Halfway through the conversation, I started noticing how people understood the same sentence differently." },
      home: { text: "我喺屋企嗰陣，講起一件好日常嘅事。", reading: "ngo5 hai2 uk1 kei2 go2 zan6, gong2 hei2 jat1 gin6 hou2 jat6 soeng4 ge3 si6.", translation: "While I was at home, an ordinary everyday matter came up." },
      nature: { text: "我望住出面嘅環境，同朋友傾返今日發生嘅事。", reading: "ngo5 mong6 zyu6 ceot1 min6 ge3 waan4 ging2, tung4 pang4 jau5 king1 faan1 gam1 jat6 faat3 sang1 ge3 si6.", translation: "Looking at the surroundings outside, I talked with a friend about what happened today." }
    }
  };

  const COHERENT_FRAME_LINES = {
    jp: [
      {
        before: [],
        after: [
          { text: "そのあと、私はそのことをもう一度確認しました。", translation: "Afterward, I checked the matter once more." }
        ],
        label: "Everyday scene"
      },
      {
        before: [
          { text: "最初は、特に問題はないと思っていました。", translation: "At first, I did not think there was any particular problem." }
        ],
        after: [
          { text: "ところが、少し考えると、別の見方もできることに気づきました。", translation: "However, after thinking about it, I realized there was another way to see the situation." }
        ],
        label: "Situation and reconsideration"
      },
      {
        before: [
          { text: "最初に聞いた説明だけでは、状況は単純に見えました。", translation: "From the first explanation alone, the situation looked simple." }
        ],
        after: [
          { text: "しかし、前後の事情を考えると、同じ出来事でも見方によって意味が変わります。", translation: "But when the surrounding circumstances are considered, the same event can mean different things depending on the viewpoint." },
          { text: "そこで、すぐに結論を出さず、もう少し情報を集めることにしました。", translation: "So I decided not to jump to a conclusion and to gather a little more information first." }
        ],
        label: "Context and inference"
      }
    ],
    yue: [
      {
        before: [],
        after: [
          { text: "之後，我再確認咗一次件事。", reading: "zi1 hau6, ngo5 zoi3 kok3 jan6 zo2 jat1 ci3 gin6 si6.", translation: "Afterward, I checked the matter once more." }
        ],
        label: "Everyday scene"
      },
      {
        before: [
          { text: "一開始，我以為冇乜特別問題。", reading: "jat1 hoi1 ci2, ngo5 ji5 wai4 mou5 mat1 dak6 bit6 man6 tai4.", translation: "At first, I thought there was no particular problem." }
        ],
        after: [
          { text: "不過再諗深一層，我先發現原來仲可以有另一個睇法。", reading: "bat1 gwo3 zoi3 nam2 sam1 jat1 cang4, ngo5 sin1 faat3 jin6 jyun4 loi4 zung6 ho2 ji5 jau5 ling6 jat1 go3 tai2 faat3.", translation: "But after thinking about it more deeply, I realized there could be another way to see it." }
        ],
        label: "Situation and reconsideration"
      },
      {
        before: [
          { text: "淨係聽最初嗰個解釋，件事好似好簡單。", reading: "zing6 hai6 teng1 zeoi3 co1 go2 go3 gaai2 sik1, gin6 si6 hou2 ci5 hou2 gaan2 daan1.", translation: "If you only hear the first explanation, the matter seems simple." }
        ],
        after: [
          { text: "但係將前因後果放埋一齊睇，同一件事可以因為角度唔同而有唔同意思。", reading: "daan6 hai6 zoeng1 cin4 jan1 hau6 gwo2 fong3 maai4 jat1 cai4 tai2, tung4 jat1 gin6 si6 ho2 ji5 jan1 wai6 gok3 dou6 m4 tung4 ji4 jau5 m4 tung4 ji3 si1.", translation: "But when the whole context is considered, the same event can mean different things from different viewpoints." },
          { text: "所以我冇即刻落結論，而係決定再搵多啲資料。", reading: "so2 ji5 ngo5 mou5 zik1 hak1 lok6 git3 leon6, ji4 hai6 kyut3 ding6 zoi3 wan2 do1 di1 zi1 liu2.", translation: "So I did not reach a conclusion immediately and decided to find more information." }
        ],
        label: "Context and inference"
      }
    ]
  };

  const COHERENT_SCENE_VARIANTS = {
    jp: {
      general: [{ text: "帰り道、今日あったことを思い返していました。", translation: "On the way home, I was thinking back over what had happened today." }],
      food: [{ text: "夕食の店を決めるため、何を食べたいか話していました。", translation: "We were talking about what we wanted to eat so we could decide where to have dinner." }],
      movement: [{ text: "駅に向かいながら、いちばん楽な行き方を考えていました。", translation: "On the way to the station, I was thinking about the easiest route." }],
      people: [{ text: "久しぶりに会った友達と、最近のことを話していました。", translation: "I was catching up on recent events with a friend I had not seen for a while." }],
      time: [{ text: "一日の予定を組み直しながら、どこに時間を使うか考えていました。", translation: "While rearranging the day's schedule, I was deciding where to spend my time." }],
      work: [{ text: "打ち合わせのあと、同僚と仕事の進め方を見直しました。", translation: "After a meeting, I reviewed how we were approaching the work with a colleague." }],
      body: [{ text: "少し疲れを感じたので、最近の生活を振り返ってみました。", translation: "Because I felt a little tired, I looked back over my recent routine." }],
      money: [{ text: "予算を見ながら、本当に必要なものを選んでいました。", translation: "Looking at the budget, I was choosing what was truly necessary." }],
      communication: [{ text: "説明がうまく伝わらなかったので、別の言い方を試しました。", translation: "Because the explanation had not come across clearly, I tried a different way of saying it." }],
      home: [{ text: "夕方、家でゆっくりしながら今日のことを話しました。", translation: "In the evening, we relaxed at home and talked about the day." }],
      nature: [{ text: "天気が変わりそうだったので、外の様子を確かめました。", translation: "Because the weather looked likely to change, I checked what it was like outside." }]
    },
    yue: {
      general: [{ text: "返屋企途中，我一路諗返今日發生嘅事。", reading: "faan1 uk1 kei2 tou4 zung1, ngo5 jat1 lou6 nam2 faan1 gam1 jat6 faat3 sang1 ge3 si6.", translation: "On the way home, I kept thinking back over what happened today." }],
      food: [{ text: "為咗決定今晚去邊度食，我哋傾緊大家想食乜。", reading: "wai6 zo2 kyut3 ding6 gam1 maan5 heoi3 bin1 dou6 sik6, ngo5 dei6 king1 gan2 daai6 gaa1 soeng2 sik6 mat1.", translation: "To decide where to eat tonight, we were talking about what everyone wanted." }],
      movement: [{ text: "行去車站嗰陣，我一路諗邊條路最方便。", reading: "haang4 heoi3 ce1 zaam6 go2 zan6, ngo5 jat1 lou6 nam2 bin1 tiu4 lou6 zeoi3 fong1 bin6.", translation: "While walking to the station, I was thinking about which route was most convenient." }],
      people: [{ text: "我同一個好耐冇見嘅朋友傾緊大家最近嘅事。", reading: "ngo5 tung4 jat1 go3 hou2 noi6 mou5 gin3 ge3 pang4 jau5 king1 gan2 daai6 gaa1 zeoi3 gan6 ge3 si6.", translation: "I was catching up on recent events with a friend I had not seen for a long time." }],
      time: [{ text: "我重新排緊今日嘅行程，諗下啲時間應該點分。", reading: "ngo5 cung4 san1 paai4 gan2 gam1 jat6 ge3 hang4 cing4, nam2 haa5 di1 si4 gaan3 jing1 goi1 dim2 fan1.", translation: "I was rearranging today's schedule and thinking about how to divide the time." }],
      work: [{ text: "開完會之後，我同同事重新睇一次點樣做件事。", reading: "hoi1 jyun4 wui2 zi1 hau6, ngo5 tung4 tung4 si6 cung4 san1 tai2 jat1 ci3 dim2 joeng6 zou6 gin6 si6.", translation: "After the meeting, I reviewed with a colleague how we should handle the task." }],
      body: [{ text: "我覺得有啲攰，所以諗返最近自己點樣生活。", reading: "ngo5 gok3 dak1 jau5 di1 gui6, so2 ji5 nam2 faan1 zeoi3 gan6 zi6 gei2 dim2 joeng6 sang1 wut6.", translation: "I felt a little tired, so I thought back over my recent routine." }],
      money: [{ text: "我望住個預算，逐樣諗清楚邊啲先係真正需要。", reading: "ngo5 mong6 zyu6 go3 jyu6 syun3, zuk6 joeng6 nam2 cing1 co2 bin1 di1 sin1 hai6 zan1 zing3 seoi1 jiu3.", translation: "Looking at the budget, I considered item by item what was truly necessary." }],
      communication: [{ text: "頭先個解釋講得唔夠清楚，所以我試下用另一個講法。", reading: "tau4 sin1 go3 gaai2 sik1 gong2 dak1 m4 gau3 cing1 co2, so2 ji5 ngo5 si3 haa5 jung6 ling6 jat1 go3 gong2 faat3.", translation: "The earlier explanation was not clear enough, so I tried another way of saying it." }],
      home: [{ text: "夜晚我哋喺屋企慢慢坐低，傾返今日啲事。", reading: "je6 maan5 ngo5 dei6 hai2 uk1 kei2 maan6 maan6 co5 dai1, king1 faan1 gam1 jat6 di1 si6.", translation: "In the evening, we sat down at home and talked through the day's events." }],
      nature: [{ text: "個天好似就嚟變，所以我出去睇下外面嘅情況。", reading: "go3 tin1 hou2 ci5 zau6 lai4 bin3, so2 ji5 ngo5 ceot1 heoi3 tai2 haa5 ngoi6 min6 ge3 cing4 fong3.", translation: "The weather looked about to change, so I went out to check the conditions." }]
    }
  };

  const COHERENT_FRAME_VARIANTS = {
    jp: [
      [{ before: [], after: [{ text: "それをきっかけに、次にどうするかを決めました。", translation: "That became the basis for deciding what to do next." }], label: "Everyday scene" }],
      [{ before: [{ text: "はじめは、いつもどおりに進めればいいと思っていました。", translation: "At first, I thought things could proceed as usual." }], after: [{ text: "でも、実際の状況を見ると、その考えを少し変える必要がありました。", translation: "But after seeing the actual situation, I needed to adjust that view." }], label: "Situation and reconsideration" }],
      [{ before: [{ text: "一つの情報だけを見ると、答えはすぐに出せそうでした。", translation: "Looking at only one piece of information, the answer seemed easy to reach." }], after: [{ text: "ところが、別の事情も加えると、最初の判断だけでは十分ではありません。", translation: "However, once another circumstance is added, the initial judgment is no longer enough." }, { text: "そのため、理由と結果を分けて考えてから判断することにしました。", translation: "For that reason, I decided to separate cause from result before making a judgment." }], label: "Context and inference" }]
    ],
    yue: [
      [{ before: [], after: [{ text: "呢件事亦都令我決定下一步應該點做。", reading: "ni1 gin6 si6 jik6 dou1 ling6 ngo5 kyut3 ding6 haa6 jat1 bou6 jing1 goi1 dim2 zou6.", translation: "This also helped me decide what to do next." }], label: "Everyday scene" }],
      [{ before: [{ text: "一開始，我以為照平時咁做就得。", reading: "jat1 hoi1 ci2, ngo5 ji5 wai4 ziu3 ping4 si4 gam2 zou6 zau6 dak1.", translation: "At first, I thought doing things the usual way would be enough." }], after: [{ text: "但係睇清楚實際情況之後，我發現要改一改原本嘅諗法。", reading: "daan6 hai6 tai2 cing1 co2 sat6 zai3 cing4 fong3 zi1 hau6, ngo5 faat3 jin6 jiu3 goi2 jat1 goi2 jyun4 bun2 ge3 nam2 faat3.", translation: "But after seeing the actual situation clearly, I realized I needed to adjust my original view." }], label: "Situation and reconsideration" }],
      [{ before: [{ text: "淨係睇一個資料，個答案好似好快就可以決定。", reading: "zing6 hai6 tai2 jat1 go3 zi1 liu2, go3 daap3 on3 hou2 ci5 hou2 faai3 zau6 ho2 ji5 kyut3 ding6.", translation: "Looking at only one piece of information, the answer seemed easy to decide." }], after: [{ text: "不過加埋另一個情況之後，最初嗰個判斷就未必夠。", reading: "bat1 gwo3 gaa1 maai4 ling6 jat1 go3 cing4 fong3 zi1 hau6, zeoi3 co1 go2 go3 pun3 dyun6 zau6 mei6 bit1 gau3.", translation: "But after adding another circumstance, the initial judgment may no longer be enough." }, { text: "所以我決定先分清楚原因同結果，再作判斷。", reading: "so2 ji5 ngo5 kyut3 ding6 sin1 fan1 cing1 co2 jyun4 jan1 tung4 git3 gwo2, zoi3 zok3 pun3 dyun6.", translation: "So I decided to separate the cause and result before making a judgment." }], label: "Context and inference" }]
    ]
  };

  function primarySemanticDomain(item) {
    const domains = [...semanticDomainsForItem(item)];
    return domains[0] || "general";
  }

  function normalizeSentencePunctuation(text, lang) {
    const value = String(text || "").trim();
    if (!value) return "";
    if (/[。！？!?]$/.test(value)) return value;
    return `${value}${lang === "jp" ? "。" : "。"}`;
  }

  function keywordGroupsFromAnswer(answer) {
    const stop = new Set(["the","a","an","is","are","was","were","to","of","and","or","in","on","at","for","that","because","it","they","he","she","their","with","by","from","this","there","after","before","more","once","first"]);
    const tokens = normalizeFreeResponse(answer).split(" ").filter(token => token.length > 3 && !stop.has(token));
    return [...new Set(tokens)].slice(0, 5).map(token => [token]);
  }

  function coherentQuestions(variantIndex, anchorTranslation, frame, fullTranslation) {
    const central = anchorTranslation || fullTranslation;
    if (variantIndex % 3 === 0) {
      const after = frame.after?.[0]?.translation || "The speaker checked the situation again.";
      return [
        { type: "CENTRAL DETAIL", question: "What is the central situation or claim described in the passage?", answer: central, keywordGroups: keywordGroupsFromAnswer(central) },
        { type: "SEQUENCE", question: "What does the speaker do after the central situation?", answer: after, keywordGroups: keywordGroupsFromAnswer(after) },
        { type: "PURPOSE", question: "Why does the final action make sense in this context?", answer: "The speaker wants to verify or better understand the situation before moving on.", keywordGroups: [["verify","understand"],["situation"]] }
      ];
    }
    if (variantIndex % 3 === 1) {
      const first = frame.before?.[0]?.translation || "At first, the speaker saw no particular problem.";
      const final = frame.after?.[0]?.translation || "The speaker realized there was another way to view the situation.";
      return [
        { type: "CHANGE IN VIEW", question: "How does the speaker's view change from the beginning to the end of the passage?", answer: `${first} ${final}`, keywordGroups: keywordGroupsFromAnswer(`${first} ${final}`) },
        { type: "EVIDENCE", question: "What information in the middle of the passage causes the speaker to reconsider the situation?", answer: central, keywordGroups: keywordGroupsFromAnswer(central) },
        { type: "INFERENCE", question: "What can you infer about the speaker's attitude at the end?", answer: "The speaker is more cautious and open to another interpretation than at the beginning.", keywordGroups: [["cautious"],["another","interpretation"]] }
      ];
    }
    const conclusion = frame.after?.at(-1)?.translation || "The speaker decides to gather more information before reaching a conclusion.";
    return [
      { type: "CONTEXT", question: "Why is the first explanation not enough for the speaker to make a confident judgment?", answer: "Because the surrounding circumstances can change how the central situation should be understood.", keywordGroups: [["circumstances","context"],["change"],["understood","interpretation"]] },
      { type: "REASONING", question: "How does the central situation support the speaker's decision at the end?", answer: `${central} This gives the speaker a reason not to conclude too quickly and to seek more information.`, keywordGroups: keywordGroupsFromAnswer(`${central} seek more information`) },
      { type: "IMPLICATION", question: "What broader lesson does the passage suggest about interpreting events or statements?", answer: "A single statement or event should be interpreted in context, and more information may be needed before reaching a conclusion.", keywordGroups: [["context"],["information"],["conclusion"]] },
      { type: "SUMMARY", question: "Summarize the passage's reasoning in two or three sentences.", answer: fullTranslation, keywordGroups: keywordGroupsFromAnswer(fullTranslation) }
    ];
  }

  function contextPassageEntry(baseEntry, variantIndex = 0) {
    const allVariants = contextVariations(baseEntry.kind, baseEntry.item);
    const lang = langFromKind(baseEntry.kind);
    const passageKind = lang === "jp" ? "jpP" : "yueP";
    const casualKind = lang === "jp" ? "jpC" : "yueC";
    const focus = humanizedPattern(baseEntry.kind, baseEntry.item);
    const meaning = meaningOf(baseEntry.item);
    const normalizedIndex = ((variantIndex % 3) + 3) % 3;
    const anchor = allVariants[normalizedIndex] || allVariants[0] || {
      text: focus,
      reading: humanizedReading(baseEntry.kind, baseEntry.item),
      translation: meaning,
      source: "AIDA context"
    };
    const domain = primarySemanticDomain(baseEntry.item);
    const sceneBank = COHERENT_SCENES[lang] || COHERENT_SCENES.jp;
    const primaryScene = sceneBank[domain] || sceneBank.general;
    const sceneOptions = [primaryScene, ...(COHERENT_SCENE_VARIANTS[lang]?.[domain] || COHERENT_SCENE_VARIANTS[lang]?.general || [])];
    const scene = sceneOptions[deterministicHash(`${baseItemKey(baseEntry)}:scene:${normalizedIndex}`) % sceneOptions.length];
    const frameOptions = [COHERENT_FRAME_LINES[lang][normalizedIndex], ...(COHERENT_FRAME_VARIANTS[lang]?.[normalizedIndex] || [])];
    const frame = frameOptions[deterministicHash(`${baseItemKey(baseEntry)}:frame:${normalizedIndex}`) % frameOptions.length];
    const segments = [scene, ...(frame.before || []), anchor, ...(frame.after || [])]
      .filter(segment => segment?.text)
      .map(segment => ({
        text: normalizeSentencePunctuation(segment.text, lang),
        reading: segment.reading || "",
        translation: segment.translation || ""
      }));
    const text = segments.map(segment => segment.text).join(lang === "jp" ? "" : "");
    const reading = lang === "yue"
      ? segments.map(segment => String(segment.reading || "").trim()).filter(Boolean).join(" ")
      : segments.map(segment => String(segment.reading || "").trim()).filter(Boolean).join(" / ");
    const translation = segments.map(segment => segment.translation).filter(Boolean).join(" ") || `A coherent context built around “${focus}” (${meaning}).`;
    const anchorTranslation = anchor.translation || meaning;
    const questions = coherentQuestions(normalizedIndex, anchorTranslation, frame, translation);
    return {
      kind: passageKind,
      item: {
        id: `ctx-p-${baseEntry.kind}-${baseEntry.item.id}-${normalizedIndex}`,
        level: itemLevel(baseEntry.kind, baseEntry.item),
        text,
        reading,
        translation,
        questions,
        scenarioType: frame.label,
        focusDomain: domain,
        contextSource: [anchor.source, "AIDA coherent scenario engine"].filter(Boolean).join(" · "),
        _sourceKind: baseEntry.kind,
        _sourceId: baseEntry.item.id
      }
    };
  }

  function materializeProductionEntry(baseEntry, variantIndex = 0) {
    const base = sourceEntryFor(baseEntry);
    const variants = contextVariations(base.kind, base.item);
    const variant = variants[variantIndex % Math.max(1, variants.length)] || {};
    const lang = langFromKind(base.kind);
    const sentenceKind = lang === "jp" ? "jpS" : "yueS";
    return {
      kind: sentenceKind,
      practiceMode: "production",
      studySkills: base.kind.endsWith("G") ? ["production", "grammar"] : ["production"],
      item: {
        id: `prod-${base.kind}-${base.item.id}-${variantIndex}`,
        level: itemLevel(base.kind, base.item),
        text: variant.text || humanizedPattern(base.kind, base.item),
        reading: variant.reading || humanizedReading(base.kind, base.item),
        translation: variant.translation || meaningOf(base.item),
        question: `Produce the ${languageName(lang)} sentence from the meaning. Type it or say it aloud before revealing the model answer.`,
        answer: variant.text || humanizedPattern(base.kind, base.item),
        contextSource: variant.source || "AIDA production context",
        practiceMode: "production",
        _sourceKind: base.kind,
        _sourceId: base.item.id
      }
    };
  }

  function markListeningEntry(entry) {
    return {
      ...entry,
      practiceMode: "listening",
      studySkills: ["listening"],
      item: { ...entry.item, practiceMode: "listening", studySkills: ["listening"] }
    };
  }

  function materializeListeningEntry(baseEntry, variantIndex = 0, passage = false) {
    const base = sourceEntryFor(baseEntry);
    const contextual = passage ? contextPassageEntry(base, variantIndex) : contextSentenceEntry(base, variantIndex);
    return markListeningEntry(contextual);
  }


  function materializeCasualEntry(baseEntry, variantIndex = 0) {
    const base = sourceEntryFor(baseEntry);
    const modes = ["transform", "notice", "judgment"];
    const exercise = modes[((variantIndex % modes.length) + modes.length) % modes.length];
    return {
      ...base,
      practiceMode: "casual",
      studySkills: ["casual"],
      item: {
        ...base.item,
        practiceMode: "casual",
        studySkills: ["casual"],
        casualExercise: exercise,
        _sourceKind: base.kind,
        _sourceId: base.item.id
      }
    };
  }

  function materializeStudyEntry(entry, index = 0) {
    const base = sourceEntryFor(entry);
    const skill = primarySkillForEntry(entry);
    const exposure = skillRecordFor(itemKey(base.kind, base.item), skill)?.seen || srsFor(itemKey(base.kind, base.item)).seen || 0;
    const progressiveVariant = exposure % 3;
    if (base.kind.endsWith("C")) return materializeCasualEntry(entry, progressiveVariant);
    if (entry.contextMode === "sentence") return contextSentenceEntry(entry, progressiveVariant);
    if (entry.contextMode === "passage") return contextPassageEntry(entry, progressiveVariant);
    if (entry.contextMode === "production") return materializeProductionEntry(entry, progressiveVariant);
    if (entry.contextMode === "listening-sentence") return materializeListeningEntry(entry, progressiveVariant, false);
    if (entry.contextMode === "listening-passage") return materializeListeningEntry(entry, progressiveVariant, true);
    if (entry.practiceMode === "listening") return markListeningEntry(entry);
    return entry;
  }


  function casualReflectionHtml(item, lang) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const kind = lang === "jp" ? "jpC" : "yueC";
    const key = qualityKey("casual", kind, item.id, 0, item.casual || item.base || "");
    const meta = { key, scope: "casual", kind, itemId: item.id, index: 0, text: item.casual || "", reading: item.reading || "", translation: item.translation || "", source: "AIDA curated casual-language curriculum", qualityStatus: item.qualityStatus || "curated", target: item.title || "Casual language" };
    return `
      <div class="casual-reflection-panel">
        <div class="context-section-head"><span>Reflect on the register shift</span><small>notice what changed before rating yourself</small></div>
        ${qualityControlsHtml(meta)}
        <div class="casual-pair-grid">
          <article><span>NEUTRAL / EXPLICIT</span><p>${escapeHtml(item.base || "")}</p></article>
          <article><span>CASUAL / CONVERSATIONAL</span><p class="${lang === "yue" ? "canto-ruby" : ""}">${lang === "yue" && item.reading ? cantoneseRubyHtml(item.casual || "", item.reading) : escapeHtml(item.casual || "")}</p></article>
        </div>
        <div class="casual-english-block"><span>ENGLISH</span><p>${escapeHtml(item.translation || "")}</p></div>
        <div class="casual-reflection-prompts">
          <p><strong>What changed?</strong> ${escapeHtml(item.whatChanged || "")}</p>
          <p><strong>Where is it natural?</strong> ${escapeHtml(item.when || "")}</p>
          ${item.caution ? `<p><strong>Do not overgeneralize:</strong> ${escapeHtml(item.caution)}</p>` : ""}
        </div>
        ${tags.length ? `<div class="casual-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>`;
  }

  function contextHtml(kind, item) {
    const rawExamples = contextVariations(kind, item);
    if (!rawExamples.length) return "";
    const readingLabel = kind.startsWith("yue") ? "Jyutping" : "Reading";
    const visible = rawExamples.map((example, index) => {
      const key = qualityKey("sentence", kind, item.id, index, example.text || "");
      return { example, index, key, meta: { key, scope: "sentence", kind, itemId: item.id, index, text: example.text || "", reading: example.reading || "", translation: example.translation || "", source: example.source || "AIDA context", qualityStatus: example.qualityStatus, target: humanizedPattern(kind, item) } };
    }).filter(row => !shouldHideQualityExample(row.key));
    if (!visible.length) return `<div class="quality-all-hidden"><strong>All context examples for this item are hidden.</strong><span>Open Profile → Example quality to review your reports.</span></div>`;
    return `
      <div class="context-section-head"><span>Validated context variations</span><small>${visible.length} visible concept-matched ${visible.length === 1 ? "example" : "examples"}</small></div>
      <div class="context-variation-grid">
        ${visible.map(({ example, index, meta }) => `
          <article class="context-variation-card">
            <div class="context-card-topline"><span>${["EASIER", "BUILD", "HARDER"][index] || String(index + 1).padStart(2, "0")}</span>${qualityControlsHtml(meta)}</div>
            <p class="context-target ${kind.startsWith("yue") ? "canto-ruby" : ""}">${kind.startsWith("yue") && example.reading ? cantoneseRubyHtml(example.text, example.reading) : escapeHtml(example.text)}</p>
            ${example.reading ? `<p class="context-reading"><b>${readingLabel}</b>${escapeHtml(example.reading)}</p>` : ""}
            ${example.translation ? `<p class="context-translation">${escapeHtml(example.translation)}</p>` : ""}
            <small>${escapeHtml(example.source || "AIDA context")}</small>
          </article>`).join("")}
      </div>`;
  }

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
    if (kind === "yueC") return allowedCantoneseLevels(state.profile.yueTarget).includes(item.level);
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
    const casualKind = lang === "jp" ? "jpC" : "yueC";
    const grammar = source[grammarKind].filter(item => inTarget(grammarKind, item, lang)).map(item => ({ kind: grammarKind, item }));
    const vocabulary = source[vocabKind].filter(item => inTarget(vocabKind, item, lang)).map(item => ({ kind: vocabKind, item }));
    const sentences = source[sentenceKind].filter(item => inTarget(sentenceKind, item, lang)).map(item => ({ kind: sentenceKind, item }));
    const passages = source[passageKind].filter(item => inTarget(passageKind, item, lang)).map(item => ({ kind: passageKind, item }));
    const casual = source[casualKind].filter(item => inTarget(casualKind, item, lang)).map(item => ({ kind: casualKind, item, practiceMode: "casual", studySkills: ["casual"] }));
    const bases = [...grammar, ...vocabulary];
    if (focus === "recognition") return vocabulary;
    if (focus === "grammar") return grammar;
    if (focus === "vocabulary") return vocabulary;
    if (focus === "production") return bases.map(entry => ({ ...entry, contextMode: "production" }));
    if (focus === "casual") return casual;
    if (focus === "listening") {
      const bank = [
        ...sentences.map(entry => ({ ...entry, practiceMode: "listening", studySkills: ["listening"] })),
        ...passages.map(entry => ({ ...entry, practiceMode: "listening", studySkills: ["listening"] }))
      ];
      const generated = bases.map(entry => ({
        ...entry,
        contextMode: deterministicHash(baseItemKey(entry)) % 4 === 0 ? "listening-passage" : "listening-sentence"
      }));
      return [...bank, ...generated];
    }
    // Every vocabulary and grammar item participates in sentence/passage practice.
    // Context is materialized only after sampling, so the app does not duplicate the full generated corpus in memory.
    if (focus === "sentences") return [...sentences, ...bases.map(entry => ({ ...entry, contextMode: "sentence" }))];
    if (focus === "passages") return [...passages, ...bases.map(entry => ({ ...entry, contextMode: "passage" }))];
    return [...grammar, ...vocabulary, ...sentences, ...passages, ...casual];
  }

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function entryHasSkillHistory(entry) {
    const key = baseItemKey(entry);
    const skill = primarySkillForEntry(entry);
    return (skillRecordFor(key, skill)?.seen || 0) > 0;
  }

  function prioritizedSample(entries, count) {
    const unseen = shuffled(entries.filter(entry => !entryHasSkillHistory(entry)));
    const learned = shuffled(entries.filter(entry => entryHasSkillHistory(entry)));
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

    // Mixed sessions deliberately exercise different memory systems instead of showing
    // the same card format repeatedly. Quotas are minimum targets; the fallback fills
    // any rounding gaps while preserving the easier-to-harder level progression.
    const buckets = [
      { focus: "recognition", weight: 0.20 },
      { focus: "grammar", weight: 0.17 },
      { focus: "production", weight: 0.14 },
      { focus: "listening", weight: 0.14 },
      { focus: "casual", weight: 0.12 },
      { focus: "sentences", weight: 0.115 },
      { focus: "passages", weight: 0.115 }
    ].map(bucket => ({ ...bucket, entries: studyPool(lang, bucket.focus) }));

    const selected = [];
    const used = new Set();
    buckets.forEach(bucket => {
      let quota = Math.floor(count * bucket.weight);
      if (["production", "listening", "casual", "sentences", "passages"].includes(bucket.focus) && count >= 6) quota = Math.max(1, quota);
      progressiveSample(bucket.entries, quota, lang).forEach(entry => {
        const key = `${entry.contextMode || entry.practiceMode || bucket.focus}:${baseItemKey(entry)}`;
        if (!used.has(key)) { used.add(key); selected.push(entry); }
      });
    });

    if (selected.length < count) {
      const fallback = buckets.flatMap(bucket => bucket.entries);
      progressiveSample(fallback, count * 5, lang).forEach(entry => {
        if (selected.length >= count) return;
        const key = `${entry.contextMode || entry.practiceMode || "base"}:${baseItemKey(entry)}`;
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
    if (kind === "jpV") return item.expression || item.reading || "";
    if (kind === "yueV") return item.word || "";
    if (kind === "jpC" || kind === "yueC") return item.casual || item.base || "";
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
      <div class="audio-status-row ${jp ? "good" : "neutral"}"><strong>Japanese browser voice</strong><span>${jp ? escapeHtml(`${jp.name} · ${jp.lang}`) : "No Japanese browser voice detected"}</span></div>
      <div class="audio-status-row neutral"><strong>Japanese neural route</strong><span>/api/japanese-tts · ${state.audio?.jpNeuralFirst !== false ? "preferred when configured" : "available as fallback"} · receives full orthographic words and complete sentence chunks</span></div>
      <div class="audio-status-row ${yue ? "good" : "neutral"}"><strong>Cantonese</strong><span>${yue ? escapeHtml(`${yue.name} · ${yue.lang}`) : "No enumerated Cantonese voice · AIDA will still try the browser's yue-CN locale fallback"}</span></div>
      <div class="audio-status-row neutral"><strong>Detected voices</strong><span>${speechVoices.length} total · ${yueCandidates.length} Cantonese candidate${yueCandidates.length === 1 ? "" : "s"}</span></div>
      <div class="audio-status-row neutral"><strong>Hosted Cantonese</strong><span>/api/cantonese-tts · used automatically when configured and no browser Cantonese voice is available</span></div>
      <p class="audio-help">For Japanese, AIDA no longer sends isolated kana readings to speech. It sends the actual written word or the complete sentence so the speech engine can analyze compounds in context. The optional Japanese neural endpoint is preferred by default because browser voices vary widely in prosody quality.</p>`;
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

  function syncTokenData(text, lang, reading = "") {
    const value = String(text || "");
    if (lang === "yue" && reading) {
      const syllables = jyutpingSyllables(reading);
      let syllableIndex = 0;
      let charIndex = 0;
      return [...value].map(char => {
        const start = charIndex;
        charIndex += char.length;
        const han = /\p{Script=Han}/u.test(char);
        const syllable = han ? (syllables[syllableIndex++] || "") : "";
        return { text: char, start, end: charIndex, syllable, punctuation: /[。！？!?、，,.；;：「」『』（）()\[\]…\s]/.test(char) };
      });
    }
    const mode = lang === "jp" ? "ja" : "yue";
    let segmented = [];
    try { segmented = segmentText(value, mode); } catch { /* parser may not be initialized yet */ }
    if (!segmented.length) segmented = [...value].map(char => ({ text: char, punctuation: /[。！？!?、，,.；;：「」『』（）()\[\]…\s]/.test(char) }));
    const originalChars = [...value];
    let cursor = 0;
    return segmented.map(token => {
      while (cursor < originalChars.length && /\s/.test(originalChars[cursor])) cursor += 1;
      const length = Math.max(1, [...String(token.text || "")].length);
      const slice = originalChars.slice(cursor, cursor + length).join("") || String(token.text || "");
      const start = cursor;
      cursor += [...slice].length;
      return { text: slice, start, end: cursor, punctuation: Boolean(token.punctuation) };
    });
  }

  function renderSyncTranscript(host, text, lang, reading = "") {
    if (!host) return [];
    const tokens = syncTokenData(text, lang, reading);
    host.innerHTML = tokens.map((token, index) => {
      const content = lang === "yue" && token.syllable
        ? `<ruby><rb>${escapeHtml(token.text)}</rb><rt>${escapeHtml(token.syllable)}</rt></ruby>`
        : escapeHtml(token.text);
      return `<span class="sync-word${token.punctuation ? " sync-punctuation" : ""}" data-sync-index="${index}" data-sync-start="${token.start}" data-sync-end="${token.end}">${content}</span>`;
    }).join("");
    return tokens;
  }

  function clearSyncHighlight(host) {
    if (!host) return;
    $$(".sync-word", host).forEach(node => node.classList.remove("active", "passed"));
  }

  function activateSyncIndex(host, index) {
    if (!host) return;
    const nodes = $$(".sync-word", host);
    nodes.forEach((node, i) => {
      node.classList.toggle("active", i === index);
      node.classList.toggle("passed", i < index);
    });
    const active = nodes[index];
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function syncIndexForChar(host, charIndex) {
    const nodes = $$(".sync-word", host);
    const index = nodes.findIndex(node => {
      const start = Number(node.dataset.syncStart) || 0;
      const end = Number(node.dataset.syncEnd) || start + 1;
      return charIndex >= start && charIndex < end;
    });
    return index >= 0 ? index : Math.max(0, nodes.length - 1);
  }

  function startApproximateSync(host, estimatedMs) {
    const nodes = $$(".sync-word", host);
    if (!nodes.length) return () => {};
    const weights = nodes.map(node => node.classList.contains("sync-punctuation") ? 0.35 : Math.max(1, [...node.textContent.trim()].length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    let elapsedWeight = 0;
    const timers = [];
    weights.forEach((weight, index) => {
      const at = estimatedMs * (elapsedWeight / totalWeight);
      timers.push(setTimeout(() => activateSyncIndex(host, index), at));
      elapsedWeight += weight;
    });
    return () => timers.forEach(clearTimeout);
  }

  function speakBrowserHighlighted(text, lang, voice, host) {
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang || (lang === "jp" ? "ja-JP" : "yue-CN");
      if (voice) utterance.voice = voice;
      utterance.rate = lang === "jp" ? 0.86 : 0.78;
      utterance.pitch = 1;
      utterance.volume = 1;
      let sawBoundary = false;
      let cancelApprox = () => {};
      const estimatedMs = Math.max(1800, [...text].length * (lang === "jp" ? 145 : 190));
      const fallbackTimer = setTimeout(() => {
        if (!sawBoundary) cancelApprox = startApproximateSync(host, estimatedMs);
      }, 420);
      utterance.onboundary = event => {
        sawBoundary = true;
        cancelApprox();
        activateSyncIndex(host, syncIndexForChar(host, Number(event.charIndex) || 0));
      };
      const finish = success => {
        clearTimeout(fallbackTimer);
        cancelApprox();
        const nodes = $$(".sync-word", host);
        nodes.forEach(node => node.classList.remove("active"));
        if (success) nodes.forEach(node => node.classList.add("passed"));
        resolve(success);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = event => {
        console.warn("AIDA highlighted speech error", event.error, voice?.name, voice?.lang);
        finish(false);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  function playAudioBlobHighlighted(blob, host) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const nodes = $$(".sync-word", host);
      const finish = success => {
        URL.revokeObjectURL(url);
        nodes.forEach(node => node.classList.remove("active"));
        if (success) nodes.forEach(node => node.classList.add("passed"));
        resolve(success);
      };
      audio.ontimeupdate = () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0 || !nodes.length) return;
        const progress = clamp(audio.currentTime / audio.duration, 0, 0.9999);
        activateSyncIndex(host, Math.min(nodes.length - 1, Math.floor(progress * nodes.length)));
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.play().catch(() => finish(false));
    });
  }

  let japaneseCloudAvailability = "unknown";

  async function fetchJapaneseSpeech(text) {
    if (!text || location.protocol === "file:" || japaneseCloudAvailability === "unavailable") return null;
    try {
      const response = await fetch("/api/japanese-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok || !(response.headers.get("content-type") || "").startsWith("audio/")) {
        if ([404, 405, 503].includes(response.status)) japaneseCloudAvailability = "unavailable";
        return null;
      }
      japaneseCloudAvailability = "available";
      return await response.blob();
    } catch {
      japaneseCloudAvailability = "unavailable";
      return null;
    }
  }

  async function speakJapaneseCloudHighlighted(text, host) {
    const blob = await fetchJapaneseSpeech(text);
    return blob ? await playAudioBlobHighlighted(blob, host) : false;
  }

  async function speakCantoneseCloudHighlighted(text, host) {
    if (!text || location.protocol === "file:") return false;
    try {
      const response = await fetch("/api/cantonese-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok || !(response.headers.get("content-type") || "").startsWith("audio/")) return false;
      return await playAudioBlobHighlighted(await response.blob(), host);
    } catch {
      return false;
    }
  }

  async function speakItemHighlighted(kind, item, host) {
    const text = speechText(kind, item);
    if (!text || !host) return speakItem(kind, item);
    const lang = langFromKind(kind);
    const reading = humanizedReading(kind, item);
    renderSyncTranscript(host, text, lang, reading);
    clearSyncHighlight(host);
    await ensureVoices();
    const voice = pickVoice(lang);
    window.speechSynthesis?.cancel?.();
    window.speechSynthesis?.resume?.();
    if (lang === "jp" && state.audio?.jpNeuralFirst !== false) {
      const cloud = await speakJapaneseCloudHighlighted(text, host);
      if (cloud) return true;
    }
    if (lang === "yue" && !voice) {
      const cloud = await speakCantoneseCloudHighlighted(text, host);
      if (cloud) return true;
    }
    if (!("speechSynthesis" in window)) return false;
    const success = await speakBrowserHighlighted(text, lang, voice, host);
    if (!success && lang === "jp") return await speakJapaneseCloudHighlighted(text, host);
    if (!success && lang === "yue") return await speakCantoneseCloudHighlighted(text, host);
    return success;
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

  async function speakJapaneseCloud(text) {
    const blob = await fetchJapaneseSpeech(text);
    return blob ? await playAudioBlob(blob) : false;
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
    const lang = langFromKind(kind);
    const text = speechText(kind, item);
    if (!text) {
      showToast("This item does not contain pronounceable target-language text.");
      return;
    }
    await ensureVoices();
    const voice = pickVoice(lang);
    const chunks = splitSpeechChunks(text);

    // Japanese pronunciation quality depends heavily on the speech front end. AIDA sends
    // orthographic words and complete sentence chunks—not flattened kana or token-by-token
    // fragments—so the engine can analyze compounds and surrounding syntax before synthesis.
    if (lang === "jp" && state.audio?.jpNeuralFirst !== false) {
      let cloudSuccess = true;
      for (const chunk of chunks) {
        if (!(await speakJapaneseCloud(chunk))) { cloudSuccess = false; break; }
      }
      if (cloudSuccess) {
        showToast("Played with hosted Japanese neural speech using full-context text.");
        return;
      }
    }

    if (!("speechSynthesis" in window)) {
      showToast(lang === "jp" ? "No Japanese speech route is available. Configure the hosted neural endpoint." : "Speech synthesis is not available in this browser.");
      return;
    }
    if (!voice && lang !== "yue") {
      // One last hosted attempt when neural-first is disabled or the browser has no voice.
      if (lang === "jp") {
        let cloudSuccess = true;
        for (const chunk of chunks) {
          if (!(await speakJapaneseCloud(chunk))) { cloudSuccess = false; break; }
        }
        if (cloudSuccess) return;
      }
      renderAudioStatus();
      showToast("No Japanese voice is exposed by this browser and the hosted Japanese endpoint is unavailable.");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

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
      if (!(await speakChunk(chunk, lang, voice))) { success = false; break; }
    }

    if (!success && lang === "jp") {
      let cloudSuccess = true;
      for (const chunk of chunks) {
        if (!(await speakJapaneseCloud(chunk))) { cloudSuccess = false; break; }
      }
      if (cloudSuccess) {
        showToast("The browser voice failed, so AIDA used hosted Japanese neural speech instead.");
        return;
      }
    }

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
      const voiceLabel = voice?.name || "the browser locale fallback";
      showToast(`The browser could not play ${languageName(lang)} with ${voiceLabel}. Configure the hosted TTS endpoint or choose another voice in Profile → Audio setup.`);
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
    if (kind.endsWith("C")) return "CASUAL LANGUAGE";
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

  function levenshteinDistance(a, b) {
    const left = [...String(a || "")];
    const right = [...String(b || "")];
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= right.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length] || 0;
  }

  function compactTargetText(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s。！？!?、，,.；;：「」『』（）()\[\]~〜・]/g, "");
  }

  function productionMatchEstimate(response, entry) {
    if (!response.trim()) return null;
    const lang = langFromKind(entry.kind);
    const target = compactTargetText(entry.item.text || humanizedPattern(entry.kind, entry.item));
    const reading = compactTargetText(humanizedReading(entry.kind, entry.item));
    let prepared = String(response || "");
    if (lang === "jp" && /[A-Za-zāīūēō]/.test(prepared)) prepared = prepareLabInput(prepared, "ja").interpreted;
    const candidates = [target, reading].filter(Boolean);
    if (!candidates.length) return null;
    const user = compactTargetText(prepared);
    if (!user) return null;
    const best = Math.max(...candidates.map(candidate => {
      const distance = levenshteinDistance(user, candidate);
      return Math.round((1 - distance / Math.max(user.length, candidate.length, 1)) * 100);
    }));
    return clamp(best, 0, 100);
  }

  function setStudySkillBadge(entry) {
    const skills = skillsForEntry(entry);
    const labels = skills.map(skill => SKILL_LABELS[skill]).join(" + ");
    $("#studySkillBadge").textContent = labels.toUpperCase();
    $("#studySkillBadge").dataset.skill = skills[0] || "recognition";
  }

  function resetPassageAssessment(entry) {
    const questions = passageQuestionsFor(entry.item);
    const listening = primarySkillForEntry(entry) === "listening" || entry.practiceMode === "listening" || entry.item.practiceMode === "listening";
    passageAssessment = {
      entry,
      questions,
      index: 0,
      correct: 0,
      results: [],
      checked: false,
      listening
    };
    $("#passageReadingStage").classList.remove("hidden");
    $("#passageQuestionStage").classList.add("hidden");
    $("#passageResultStage").classList.add("hidden");
    $("#passageFeedback").classList.add("hidden");
    $("#passageResultTranscriptWrap").classList.add("hidden");
    $("#passageResponse").value = "";
    $("#passageListeningPrompt").classList.toggle("hidden", !listening);
    $("#passageText").classList.toggle("hidden", listening);
    $("#passageStageKicker").textContent = listening ? "LISTEN FIRST · TRANSCRIPT HIDDEN" : "READ FIRST · NO TRANSLATION";
    $("#startPassageQuestions").textContent = listening ? "Begin listening comprehension ↗" : "Begin comprehension test ↗";
    $("#passageText").textContent = listening ? "" : (entry.item.text || "");
    $("#passageReferenceSummary").textContent = listening ? "Listening passage" : "Passage";
    $("#passageReferenceText").textContent = listening ? "Transcript stays hidden until the assessment is complete. Replay the audio whenever you need it." : (entry.item.text || "");
    $("#replayListeningPassage").classList.toggle("hidden", !listening);
  }

  function renderStudyItem() {
    const entry = study.items[study.index];
    if (!entry) {
      finishStudy();
      return;
    }

    const { kind, item } = entry;
    const percent = (study.index / study.items.length) * 100;
    const grammar = sourceEntryFor(entry).kind.endsWith("G");
    const comprehension = isComprehensionKind(kind);
    const passage = kind.endsWith("P");
    const practiceMode = entry.practiceMode || item.practiceMode || "";
    const listening = practiceMode === "listening";
    const production = practiceMode === "production";
    const casual = practiceMode === "casual" || kind.endsWith("C");
    study.revealed = false;

    $("#sessionProgressBar").style.width = `${percent}%`;
    $("#studySessionProgress").textContent = `${study.index + 1} / ${study.items.length}`;
    $("#studyItemType").textContent = listening ? (passage ? "LISTENING PASSAGE" : "LISTENING") : production ? "PRODUCTION" : casual ? "CASUAL LANGUAGE" : studyTypeLabel(kind);
    $("#studyItemLevel").textContent = itemLevel(kind, item);
    setStudySkillBadge(entry);

    $("#standardStudyExperience").classList.toggle("hidden", passage);
    $("#passageStudyExperience").classList.toggle("hidden", !passage);

    if (passage) {
      resetPassageAssessment(entry);
      return;
    }

    $("#studyLanguageLabel").textContent = study.lang === "jp" ? "日本語 · JAPANESE" : "廣東話 · CANTONESE";
    $("#listeningChallenge").classList.toggle("hidden", !listening);
    $("#productionChallenge").classList.toggle("hidden", !production && !casual);
    $("#productionInput").value = "";
    $("#productionInput").placeholder = casual ? "Rewrite it the way you would actually say it casually…" : "Type the target-language sentence before revealing…";
    $("#productionMatch").classList.add("hidden");
    $("#listeningResponse").value = "";
    $("#listeningMatch").classList.add("hidden");
    $("#studySyncTranscript").classList.add("hidden");
    $("#studySyncTranscriptText").innerHTML = "";

    if (casual) {
      const exercise = item.casualExercise || "transform";
      if (exercise === "notice") {
        $("#studyMain").textContent = item.casual || "";
        $("#studyQuestion").textContent = `What changed from the more explicit version “${item.base || ""}”? Identify omissions, contractions, particles, or register shifts.`;
        $("#productionInput").placeholder = "Write what you notice before revealing…";
      } else if (exercise === "judgment") {
        $("#studyMain").textContent = item.casual || "";
        $("#studyQuestion").textContent = "Where would this sound natural, and what would be risky to overgeneralize? Think about relationship, setting, and nuance.";
        $("#productionInput").placeholder = "Write your register judgment before revealing…";
      } else {
        $("#studyMain").textContent = item.title || "Make it conversational.";
        $("#studyQuestion").textContent = `Rewrite this naturally for casual conversation: ${item.base || ""}`;
        $("#productionInput").placeholder = "Rewrite it the way you would actually say it casually…";
      }
    } else if (listening) {
      $("#studyMain").textContent = "Listen to the full sentence.";
      $("#studyQuestion").textContent = "Reconstruct the meaning before revealing the transcript. Replay as often as needed.";
    } else if (production) {
      $("#studyMain").textContent = meaningOf(item) || "Produce the target-language sentence.";
      $("#studyQuestion").textContent = item.question || `Produce the ${languageName(study.lang)} sentence before revealing the model answer.`;
    } else {
      $("#studyMain").textContent = humanizedPattern(kind, item);
      $("#studyQuestion").textContent = comprehension ? item.question : "Recall the meaning and usage, then reveal the answer.";
    }

    const reading = humanizedReading(kind, item);
    $("#studyReadingLabel").textContent = study.lang === "yue" ? "Jyutping" : "Reading";
    $("#studyReading").textContent = reading;
    $("#studyReadingBlock").classList.toggle("hidden", !reading);
    if (casual) {
      const exercise = item.casualExercise || "transform";
      $("#studyMeaning").textContent = exercise === "notice"
        ? (item.whatChanged || "")
        : exercise === "judgment"
          ? [item.when, item.caution].filter(Boolean).join(" ")
          : (item.casual || "");
    } else {
      $("#studyMeaning").textContent = production ? humanizedPattern(kind, item) : meaningOf(item);
    }
    $("#studyMeta").textContent = [displayMeta(kind, item), item.contextSource].filter(Boolean).join(" · ");

    const guide = casual
      ? [
          item.translation ? `English: ${item.translation}` : "",
          item.casualExercise === "notice"
            ? [item.when ? `Use: ${item.when}` : "", item.caution ? `Watch out: ${item.caution}` : ""].filter(Boolean).join(" ")
            : item.casualExercise === "judgment"
              ? item.whatChanged || ""
              : [item.whatChanged, item.when ? `Use: ${item.when}` : "", item.caution ? `Watch out: ${item.caution}` : ""].filter(Boolean).join(" ")
        ].filter(Boolean).join(" ")
      : production
      ? `Model meaning: ${meaningOf(item)}`
      : comprehension
        ? `Answer: ${item.answer}`
        : grammar ? `${sourceEntryFor(entry).item.usage_note || ""}${grammarGuide(sourceEntryFor(entry).item) ? ` ${grammarGuide(sourceEntryFor(entry).item)}` : ""}`.trim() : "";
    $("#studyGuide").classList.toggle("hidden", !guide);
    $("#studyGuide").textContent = guide;

    const base = sourceEntryFor(entry);
    const contexts = /^(jp|yue)[GV]$/.test(base.kind) && !listening && !production && !casual ? contextHtml(base.kind, base.item) : casual ? casualReflectionHtml(item, study.lang) : "";
    $("#studyContexts").classList.toggle("hidden", !contexts);
    $("#studyContexts").innerHTML = contexts;
    $("#speakCurrent").disabled = !speechText(kind, item);
    $("#speakCurrent").classList.toggle("hidden", production && !study.revealed);
    $("#speakCurrent").textContent = listening ? "Play audio" : "Play pronunciation";

    $("#singleStudyCard").classList.remove("revealed");
    $("#studyAnswer").classList.add("hidden");
    $("#studyActions").classList.add("hidden");
    $("#studyRevealHint").classList.remove("hidden");
    renderRatingPreviews(entry);
  }

  function revealStudyCard() {
    if (study.revealed) return;
    study.revealed = true;
    const entry = study.items[study.index];
    if (!entry) return;
    const practiceMode = entry.practiceMode || entry.item.practiceMode || "";
    const reading = humanizedReading(entry.kind, entry.item);

    if (practiceMode === "casual") {
      const typed = $("#productionInput").value.trim();
      const exercise = entry.item.casualExercise || "transform";
      if (typed && exercise === "transform") {
        const expected = { ...entry, item: { ...entry.item, text: entry.item.casual || "" } };
        const estimate = productionMatchEstimate(typed, expected);
        if (estimate !== null) {
          $("#productionMatch").classList.remove("hidden");
          $("#productionMatch").innerHTML = `<strong>${estimate}%</strong><span>surface-form similarity to the conversational model — compare the actual omissions, contractions, and register choices yourself</span>`;
        }
      } else if (typed) {
        $("#productionMatch").classList.remove("hidden");
        $("#productionMatch").innerHTML = `<strong>Reflect</strong><span>Compare your observation with the explanation below. Register judgments are contextual, so the app does not pretend there is one exact typed answer.</span>`;
      }
      if (study.lang === "yue" && reading) {
        if (exercise === "transform") $("#studyMeaning").innerHTML = cantoneseRubyHtml(entry.item.casual || "", reading);
        else $("#studyMain").innerHTML = cantoneseRubyHtml(entry.item.casual || "", reading);
      }
    } else if (practiceMode === "listening") {
      const response = $("#listeningResponse").value.trim();
      if (response) {
        const meaningAnswer = meaningOf(entry.item) || entry.item.answer || "";
        const meaningScore = meaningAnswer ? passageMatchEstimate(response, { answer: meaningAnswer, keywordGroups: keywordGroupsFromAnswer(meaningAnswer) }) : 0;
        const transcriptScore = productionMatchEstimate(response, entry) || 0;
        const estimate = Math.max(meaningScore, transcriptScore);
        $("#listeningMatch").classList.remove("hidden");
        $("#listeningMatch").innerHTML = `<strong>${estimate}%</strong><span>local match hint against the meaning or transcript — judge your actual understanding yourself</span>`;
      }
      $("#studySyncTranscript").classList.remove("hidden");
      renderSyncTranscript($("#studySyncTranscriptText"), speechText(entry.kind, entry.item), study.lang, reading);
    } else if (practiceMode === "production") {
      const estimate = productionMatchEstimate($("#productionInput").value, entry);
      if (estimate !== null) {
        $("#productionMatch").classList.remove("hidden");
        $("#productionMatch").innerHTML = `<strong>${estimate}%</strong><span>surface-form similarity to the model answer — use this only as a hint</span>`;
      }
      if (study.lang === "yue" && reading) $("#studyMeaning").innerHTML = cantoneseRubyHtml(humanizedPattern(entry.kind, entry.item), reading);
      $("#speakCurrent").classList.remove("hidden");
    } else if (study.lang === "yue" && reading) {
      $("#studyMain").innerHTML = cantoneseRubyHtml(humanizedPattern(entry.kind, entry.item), reading);
    }

    $("#singleStudyCard").classList.add("revealed");
    $("#studyAnswer").classList.remove("hidden");
    $("#studyActions").classList.remove("hidden");
    $("#studyRevealHint").classList.add("hidden");
    renderRatingPreviews(entry);
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
    const { entry, questions, correct, listening } = passageAssessment;
    const accuracy = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    const rating = accuracy >= 90 ? 5 : accuracy >= 70 ? 4 : accuracy >= 40 ? 2 : 1;
    scheduleEntry(entry, rating);
    study.ratings.push(rating);

    $("#passageQuestionStage").classList.add("hidden");
    $("#passageResultStage").classList.remove("hidden");
    $("#passageScoreOrb").textContent = `${accuracy}%`;
    const skillLabel = SKILL_LABELS[primarySkillForEntry(entry)] || "Reading";
    $("#passageResultSummary").textContent = `${correct} of ${questions.length} questions marked correct. ${skillLabel} was scheduled with FSRS as ${rating === 5 ? "Easy" : rating === 4 ? "Good" : rating === 2 ? "Hard" : "Again"}.`;
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
    $("#passageResultTranscriptWrap").classList.remove("hidden");
    renderSyncTranscript($("#passageResultTranscript"), entry.item.text || "", study.lang, resultReading);
    if (listening) showToast("Listening transcript unlocked. Replay it with synchronized highlighting.");
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
  let reviewCurrentPractice = null;

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
      const skill = dueSkillForKey(entry.key);
      return `
        <button class="queue-card ${absoluteIndex === reviewIndex ? "active" : ""}" draggable="true" data-review-key="${escapeHtml(entry.key)}">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          <span class="queue-lang">${lang === "jp" ? "日" : "粵"}</span>
          <span class="queue-copy">
            <strong>${escapeHtml(humanizedPattern(entry.kind, entry.item))}</strong>
            <small>${escapeHtml(SKILL_LABELS[skill])} · ${due ? "Due now" : `Mastery ${entry.srs.mastery || 0}%`}</small>
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

  function materializeReviewPractice(entry) {
    const skill = dueSkillForKey(entry.key);
    const record = skillRecordFor(entry.key, skill);
    const variant = (record?.seen || 0) % 3;
    if (skill === "production") return materializeProductionEntry(entry, variant);
    if (skill === "listening") {
      const passage = entry.kind.endsWith("P") || deterministicHash(entry.key) % 5 === 0;
      if (entry.kind.endsWith("S") || entry.kind.endsWith("P")) return markListeningEntry(entry);
      return materializeListeningEntry(entry, variant, passage);
    }
    if (skill === "reading" && !entry.kind.endsWith("S") && !entry.kind.endsWith("P")) {
      return deterministicHash(entry.key) % 3 === 0 ? contextPassageEntry(entry, variant) : contextSentenceEntry(entry, variant);
    }
    if (skill === "casual" || entry.kind.endsWith("C")) return materializeCasualEntry(entry, variant);
    return { ...entry, studySkills: [skill] };
  }

  function renderReviewCard() {
    const entry = reviewQueue[reviewIndex];
    if (!entry) return;
    const due = entry.srs.due <= Date.now();
    const lang = langFromKind(entry.kind);
    const skill = dueSkillForKey(entry.key);
    reviewCurrentPractice = materializeReviewPractice(entry);
    const practice = reviewCurrentPractice;
    const reading = humanizedReading(practice.kind, practice.item);
    const readingLabel = lang === "yue" ? "Jyutping" : "Reading";
    const mode = practice.practiceMode || practice.item.practiceMode || "";

    $("#reviewSessionCount").textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;
    $("#reviewSessionDue").textContent = `${SKILL_LABELS[skill]} · ${due ? "Due now" : `Mastery ${skillMasteryForKey(entry.key, skill)}%`}`;
    $("#reviewSideLabel").textContent = `${lang === "jp" ? "JAPANESE" : "CANTONESE"} · ${SKILL_LABELS[skill].toUpperCase()} REVIEW`;

    if (mode === "casual") {
      const exercise = practice.item.casualExercise || "transform";
      $("#reviewPrompt").textContent = exercise === "transform" ? (practice.item.base || practice.item.title || "Make it conversational.") : (practice.item.casual || practice.item.title || "Casual language");
      $("#reviewPromptSub").textContent = exercise === "transform" ? "Produce the natural casual version before revealing." : exercise === "notice" ? "Identify what changed and why it sounds conversational." : "Judge where this register sounds natural before revealing.";
    } else if (mode === "listening") {
      $("#reviewPrompt").textContent = "Listen to the context.";
      $("#reviewPromptSub").textContent = "The transcript stays hidden until you reveal. Reconstruct the meaning first.";
    } else if (mode === "production") {
      $("#reviewPrompt").textContent = meaningOf(practice.item) || "Produce the target-language sentence.";
      $("#reviewPromptSub").textContent = "Say or write the target-language model before revealing it.";
    } else {
      $("#reviewPrompt").textContent = humanizedPattern(practice.kind, practice.item);
      $("#reviewPromptSub").textContent = practice.kind.endsWith("P")
        ? "Recall the passage meaning and main ideas before revealing."
        : skill === "reading" ? "Read for meaning before revealing the explanation." : "Recall the meaning and usage before revealing.";
    }

    $("#speakReview").disabled = !speechText(practice.kind, practice.item);
    $("#speakReview").classList.toggle("hidden", mode === "production");
    $("#reviewReveal").classList.add("hidden");
    $("#reviewReveal").innerHTML = "";
    $("#reviewControls").innerHTML = '<button class="btn primary" id="revealReview">Reveal answer</button>';
    $("#revealReview").addEventListener("click", revealReview);
  }

  function revealReview() {
    const baseEntry = reviewQueue[reviewIndex];
    const entry = reviewCurrentPractice || baseEntry;
    if (!baseEntry || !entry) return;
    const lang = langFromKind(baseEntry.kind);
    const reading = humanizedReading(entry.kind, entry.item);
    const mode = entry.practiceMode || entry.item.practiceMode || "";
    const target = humanizedPattern(entry.kind, entry.item);

    if (mode !== "listening" && mode !== "production" && lang === "yue" && reading) {
      $("#reviewPrompt").innerHTML = cantoneseRubyHtml(target, reading);
    }

    let revealHtml = "";
    if (mode === "casual") {
      const casualTarget = entry.item.casual || target;
      const casualReading = entry.item.reading || reading;
      revealHtml = `
        <div class="production-model-answer"><span>Casual / conversational</span><p class="${lang === "yue" ? "canto-ruby" : ""}">${lang === "yue" && casualReading ? cantoneseRubyHtml(casualTarget, casualReading) : escapeHtml(casualTarget)}</p></div>
        <div class="review-english-answer"><span>English</span><strong>${escapeHtml(entry.item.translation || meaningOf(entry.item))}</strong></div>
        <p><strong>What changed:</strong> ${escapeHtml(entry.item.whatChanged || "")}</p>
        <p><strong>Where it is natural:</strong> ${escapeHtml(entry.item.when || "")}</p>
        ${entry.item.caution ? `<p><strong>Watch out:</strong> ${escapeHtml(entry.item.caution)}</p>` : ""}`;
    } else if (mode === "listening") {
      revealHtml = `
        <div class="review-sync-block">
          <div class="sync-transcript-head"><span>Transcript</span><button type="button" class="speak-btn compact-audio" id="replayReviewSync">Replay with highlighting</button></div>
          <div id="reviewSyncTranscript" class="sync-transcript"></div>
        </div>
        <strong>${escapeHtml(meaningOf(entry.item))}</strong>
        ${reading && lang !== "yue" ? `<div class="review-reading-line"><span>Reading</span><p>${escapeHtml(reading)}</p></div>` : ""}`;
    } else if (mode === "production") {
      revealHtml = `
        <div class="production-model-answer"><span>Model answer</span><p class="${lang === "yue" ? "canto-ruby" : ""}">${lang === "yue" && reading ? cantoneseRubyHtml(target, reading) : escapeHtml(target)}</p></div>
        ${reading && lang !== "yue" ? `<div class="review-reading-line"><span>Reading</span><p>${escapeHtml(reading)}</p></div>` : ""}
        <strong>${escapeHtml(meaningOf(entry.item))}</strong>`;
    } else {
      revealHtml = `
        ${lang !== "yue" && reading ? `<div class="review-reading-line"><span>${lang === "yue" ? "Jyutping" : "Reading"}</span><p>${escapeHtml(reading)}</p></div>` : ""}
        <strong>${escapeHtml(meaningOf(entry.item))}</strong>
        ${sourceEntryFor(entry).kind.endsWith("G") && grammarGuide(sourceEntryFor(entry).item) ? `<p>${escapeHtml(grammarGuide(sourceEntryFor(entry).item))}</p>` : ""}
        <small>${escapeHtml(displayMeta(sourceEntryFor(entry).kind, sourceEntryFor(entry).item))}</small>`;
    }

    $("#reviewReveal").innerHTML = revealHtml;
    $("#reviewReveal").classList.remove("hidden");
    if (mode === "listening") {
      renderSyncTranscript($("#reviewSyncTranscript"), speechText(entry.kind, entry.item), lang, reading);
      $("#replayReviewSync")?.addEventListener("click", () => speakItemHighlighted(entry.kind, entry.item, $("#reviewSyncTranscript")));
    }
    const preview = fsrsRatingPreview(entry);
    const labels = { 1: "Again", 2: "Hard", 4: "Good", 5: "Easy" };
    $("#reviewControls").innerHTML = `
      <div class="review-rating-row">
        ${[1,2,4,5].map(rating => `<button class="rating-btn ${rating === 1 ? "again" : rating === 2 ? "hard" : rating === 4 ? "good" : "easy"}" data-review-rating="${rating}"><span>${labels[rating]}</span><small>${escapeHtml(preview[rating] || "")}</small></button>`).join("")}
      </div>`;
    $$('[data-review-rating]').forEach(button => {
      button.addEventListener("click", () => {
        const rating = Number(button.dataset.reviewRating);
        scheduleEntry(entry, rating);
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
      itemCategory(kind, item),
      ...itemTopics(kind, item)
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
    const casualKind = lang === "jp" ? "jpC" : "yueC";
    return [
      ...source[sentenceKind].filter(item => String(item.text || "").includes(surface)).map(item => ({ kind: sentenceKind, item })),
      ...source[passageKind].filter(item => String(item.text || "").includes(surface)).map(item => ({ kind: passageKind, item }))
    ].slice(0, 10);
  }

  function renderDirectReadingMatch(match, lang) {
    const reading = humanizedReading(match.kind, match.item);
    const text = match.item.text || "";
    const target = lang === "yue" && reading ? cantoneseRubyHtml(text, reading) : escapeHtml(text);
    const key = qualityKey("reading-bank", match.kind, match.item.id, 0, text);
    if (shouldHideQualityExample(key)) return "";
    const meta = { key, scope: "reading-bank", kind: match.kind, itemId: match.item.id, index: 0, text, reading, translation: meaningOf(match.item), source: "Bundled reading bank", qualityStatus: "curated", target: match.kind.endsWith("P") ? "Passage bank" : "Sentence bank" };
    return `<article class="direct-reading-match">
      <span>${match.kind.endsWith("P") ? "PASSAGE BANK" : "SENTENCE BANK"} · ${escapeHtml(itemLevel(match.kind, match.item))}</span>
      ${qualityControlsHtml(meta)}
      <p class="${lang === "yue" ? "canto-ruby" : ""}">${target}</p>
      ${lang !== "yue" && reading ? `<small>${escapeHtml(reading)}</small>` : ""}
      <div class="direct-reading-english"><span>ENGLISH</span><p>${escapeHtml(meaningOf(match.item))}</p></div>
      ${match.item.questions?.length ? `<details><summary>Show comprehension questions</summary><div class="direct-reading-reveal">${(match.item.questions || []).map(renderContextQuestion).join("")}</div></details>` : ""}
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
          ${sentences.map((example, index) => {
            const key = qualityKey("sentence", kind, item.id, index, example.text || "");
            if (shouldHideQualityExample(key)) return "";
            const meta = { key, scope: "sentence", kind, itemId: item.id, index, text: example.text || "", reading: example.reading || "", translation: example.translation || "", source: example.source || "AIDA context", qualityStatus: example.qualityStatus, target: humanizedPattern(kind, item) };
            return `<article class="context-review-card">
              <div class="context-audio-head"><span class="context-difficulty">${["EASIER", "BUILD", "HARDER"][index]}</span><button type="button" class="context-audio-button" data-context-sentence-audio="${index}">Listen ↗</button></div>
              ${qualityControlsHtml(meta)}
              <p class="context-review-target ${lang === "yue" ? "canto-ruby" : ""}" data-context-sentence-sync="${index}">${lang === "yue" && example.reading ? cantoneseRubyHtml(example.text, example.reading) : escapeHtml(example.text)}</p>
              ${lang !== "yue" && example.reading ? `<p class="context-review-reading">${escapeHtml(example.reading)}</p>` : ""}
              <p class="context-review-translation">${escapeHtml(example.translation || "")}</p>
            </article>`;
          }).join("")}
        </div>
      </section>

      <section class="context-review-section">
        <div class="context-review-section-head"><div><span>02</span><h4>Passage variations</h4></div><p>Read for meaning first, then use the prompts to check actual comprehension.</p></div>
        <div class="context-review-passage-list">
          ${passages.map((passage, index) => {
            const key = qualityKey("passage", kind, item.id, index, passage.text || "");
            if (shouldHideQualityExample(key)) return "";
            const meta = { key, scope: "passage", kind, itemId: item.id, index, text: passage.text || "", reading: passage.reading || "", translation: passage.translation || "", source: passage.contextSource || "AIDA generated coherent passage", qualityStatus: passage.qualityStatus || "generated", target: humanizedPattern(kind, item) };
            return `<article class="context-passage-card">
            <div class="context-passage-head"><span>${["EASIER", "BUILD", "HARDER"][index]}</span><div><strong>${passage.questions?.length || 0} comprehension prompts</strong><button type="button" class="context-audio-button" data-context-passage-audio="${index}">Listen with highlighting ↗</button></div></div>
            ${qualityControlsHtml(meta)}
            <p class="context-passage-text ${lang === "yue" ? "canto-ruby" : ""}" data-context-passage-sync="${index}">${lang === "yue" && passage.reading ? cantoneseRubyHtml(passage.text, passage.reading) : escapeHtml(passage.text)}</p>
            ${lang !== "yue" && passage.reading ? `<p class="context-review-reading">${escapeHtml(passage.reading)}</p>` : ""}
            <div class="context-passage-english"><span>ENGLISH</span><p>${escapeHtml(passage.translation || "")}</p></div>
            <div class="context-question-list">${(passage.questions || []).map(renderContextQuestion).join("")}</div>
          </article>`; }).join("")}
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

    $$('[data-context-sentence-audio]', host).forEach(button => button.addEventListener("click", async () => {
      const index = Number(button.dataset.contextSentenceAudio);
      const example = sentences[index];
      const target = $(`[data-context-sentence-sync="${index}"]`, host);
      if (!example || !target) return;
      button.disabled = true;
      button.textContent = "Playing…";
      await speakItemHighlighted(lang === "jp" ? "jpS" : "yueS", { text: example.text, reading: example.reading || "" }, target);
      button.disabled = false;
      button.textContent = "Replay ↗";
    }));
    $$('[data-context-passage-audio]', host).forEach(button => button.addEventListener("click", async () => {
      const index = Number(button.dataset.contextPassageAudio);
      const passage = passages[index];
      const target = $(`[data-context-passage-sync="${index}"]`, host);
      if (!passage || !target) return;
      button.disabled = true;
      button.textContent = "Playing…";
      await speakItemHighlighted(lang === "jp" ? "jpP" : "yueP", passage, target);
      button.disabled = false;
      button.textContent = "Replay with highlighting ↗";
    }));
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

  // ---------- example quality control ----------

  function qualityReasonLabel(reason) {
    return ({
      "incorrect-grammar":"Grammar or usage is incorrect",
      "concept-mismatch":"Does not demonstrate the target concept",
      "unnatural":"Unnatural or unlikely wording",
      "translation":"Translation or meaning is wrong",
      "reading":"Reading / Jyutping is wrong",
      "level":"Difficulty or level is wrong",
      "audio":"Audio does not match",
      "other":"Other"
    })[reason] || titleCase(reason);
  }

  function openQualityReport(key) {
    const meta = qualityExampleRegistry.get(key);
    if (!meta) return;
    pendingQualityKey = key;
    const existing = qualityReportFor(key);
    $("#qualityReportPreview").innerHTML = `
      <div class="quality-report-target"><span>${escapeHtml(meta.target || meta.scope || "Example")}</span><p>${escapeHtml(meta.text || "")}</p>${meta.translation ? `<small>${escapeHtml(meta.translation)}</small>` : ""}</div>
      ${qualityControlsHtml(meta)}`;
    $("#qualityReportReason").value = existing?.reason || "incorrect-grammar";
    $("#qualityReportNotes").value = existing?.notes || "";
    $("#qualityReportHide").checked = existing ? Boolean(existing.hidden) : true;
    showDialog($("#qualityReportDialog"));
  }

  function saveQualityReport() {
    const meta = qualityExampleRegistry.get(pendingQualityKey);
    if (!meta) return;
    state.quality ||= { reports: {}, hideReported: true };
    state.quality.reports ||= {};
    state.quality.reports[pendingQualityKey] = {
      key: pendingQualityKey,
      scope: meta.scope,
      kind: meta.kind,
      itemId: meta.itemId,
      index: meta.index,
      target: meta.target || "",
      text: meta.text || "",
      reading: meta.reading || "",
      translation: meta.translation || "",
      source: meta.source || "",
      qualityStatus: qualityStatusFor(meta),
      reason: $("#qualityReportReason").value,
      notes: $("#qualityReportNotes").value.trim(),
      hidden: $("#qualityReportHide").checked,
      updatedAt: Date.now(),
      createdAt: qualityReportFor(pendingQualityKey)?.createdAt || Date.now()
    };
    saveState();
    closeDialog($("#qualityReportDialog"));
    renderQualitySummary();
    renderQualityManager();
    if (contextBrowserDialog?.open) renderContextBrowserDetail(byId.get(contextBrowserSelectedKey));
    showToast("Example report saved.");
  }

  function qualityCounts() {
    const reports = Object.values(state.quality?.reports || {});
    return {
      total: reports.length,
      hidden: reports.filter(report => report.hidden).length,
      grammar: reports.filter(report => ["incorrect-grammar","concept-mismatch"].includes(report.reason)).length
    };
  }

  function renderQualitySummary() {
    const counts = qualityCounts();
    const host = $("#qualitySummary");
    if (host) host.innerHTML = `
      <div><strong>${counts.total}</strong><span>reported</span></div>
      <div><strong>${counts.hidden}</strong><span>hidden locally</span></div>
      <div><strong>${counts.grammar}</strong><span>grammar / concept flags</span></div>`;
    const checkbox = $("#hideReportedExamples");
    if (checkbox) checkbox.checked = state.quality?.hideReported !== false;
  }

  function renderQualityManager() {
    const host = $("#qualityReportList");
    if (!host) return;
    const reports = Object.values(state.quality?.reports || {}).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const stats = $("#qualityManagerStats");
    if (stats) {
      const counts = qualityCounts();
      stats.innerHTML = `<div><strong>${counts.total}</strong><span>reports</span></div><div><strong>${counts.hidden}</strong><span>hidden</span></div><div><strong>${counts.grammar}</strong><span>concept flags</span></div>`;
    }
    host.innerHTML = reports.length ? reports.map(report => `
      <article class="quality-report-row" data-quality-report-row="${escapeHtml(report.key)}">
        <div class="quality-report-row-head"><div>${qualityBadgeHtml(report.qualityStatus || "unverified", report.key)}<span class="quality-reason">${escapeHtml(qualityReasonLabel(report.reason))}</span></div><time>${new Date(report.updatedAt || report.createdAt || Date.now()).toLocaleDateString()}</time></div>
        <strong>${escapeHtml(report.target || report.scope || "Example")}</strong>
        <p class="quality-report-text">${escapeHtml(report.text || "")}</p>
        ${report.translation ? `<p class="quality-report-translation">${escapeHtml(report.translation)}</p>` : ""}
        ${report.notes ? `<p class="quality-report-notes">${escapeHtml(report.notes)}</p>` : ""}
        <div class="quality-report-actions"><button class="btn secondary compact-btn" data-quality-toggle-hide="${escapeHtml(report.key)}">${report.hidden ? "Restore example" : "Hide example"}</button><button class="btn danger compact-btn" data-quality-delete="${escapeHtml(report.key)}">Remove report</button></div>
      </article>`).join("") : '<div class="quality-empty">No examples reported yet. Every context card has a “Report issue” control.</div>';
  }

  function openQualityManager() {
    renderQualitySummary();
    renderQualityManager();
    closeDialog($("#profileDialog"));
    showDialog($("#qualityManagerDialog"));
  }

  // ---------- source library ----------

  const libraryDialog = $("#dataLibrary");
  const datasetConfig = {
    japaneseGrammar: { label: "Japanese grammar", items: source.jpG, kind: "jpG", categoryLabel: "Category" },
    japaneseVocabulary: { label: "Japanese vocabulary", items: source.jpV, kind: "jpV", categoryLabel: "Topic" },
    cantoneseGrammar: { label: "Cantonese grammar", items: source.yueG, kind: "yueG", categoryLabel: "Category" },
    cantoneseVocabulary: { label: "Cantonese vocabulary", items: source.yueV, kind: "yueV", categoryLabel: "Topic" }
  };
  let currentDataset = "japaneseGrammar";
  let librarySearchTimer;

  function searchText(kind, item) {
    if (kind === "jpG") return [item.pattern, item.meaning, item.level, item.category, item.course_group].join(" ");
    if (kind === "jpV") return [item.expression, item.reading, item.meaning, item.level, japaneseVocabCollection(item), ...itemTopics(kind, item)].join(" ");
    if (kind === "yueG") return [item.pattern, item.jyutping, item.meaning, item.level, item.category, item.usage_note, item.register].join(" ");
    return [item.word, item.jyutping, item.meaning, item.note, yueVocabLevel(item), cantoneseVocabBand(item), ...itemTopics(kind, item), ...(item.examples || []).flatMap(example => [example.sentence, example.meaning, example.jyutping])].join(" ");
  }

  function availableLevels(config) {
    if (config.kind === "jpG" || config.kind === "jpV") return JP_LEVELS;
    return YUE_LEVELS;
  }

  function availableCategories(config) {
    const values = (config.kind === "jpV" || config.kind === "yueV")
      ? config.items.flatMap(item => itemTopics(config.kind, item))
      : config.items.map(item => itemCategory(config.kind, item));
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
      ? `<div class="library-example"><strong>Example</strong><span>${escapeHtml(item.examples[0].sentence || "")}${item.examples[0].jyutping ? ` · ${escapeHtml(item.examples[0].jyutping)}` : ""}</span><small>${escapeHtml(item.examples[0].meaning || "")}</small></div>`
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
      if (selectedCategory !== "all") {
        const categories = (config.kind === "jpV" || config.kind === "yueV") ? itemTopics(config.kind, item) : [itemCategory(config.kind, item)];
        if (!categories.includes(selectedCategory)) return false;
      }
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
            <span><strong>${escapeHtml(humanizedPattern(entry.kind, entry.item))}</strong><small>${escapeHtml(itemLevel(entry.kind, entry.item))} · Next: ${escapeHtml(SKILL_LABELS[dueSkillForKey(entry.key)] || "Recognition")} · Mastery ${entry.srs.mastery || 0}%</small></span>
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

  function renderSkillMiniSummary(lang) {
    return SKILLS.map(skill => {
      const value = languageSkillMastery(lang, skill);
      return `<div class="skill-mini"><span>${escapeHtml(SKILL_LABELS[skill])}</span><div><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`;
    }).join("");
  }

  function openProfile() {
    $("#profileNameInput").value = state.profile.name;
    $("#jpTargetInput").value = state.profile.jpTarget;
    $("#yueTargetInput").value = state.profile.yueTarget;
    $("#jpDailyGoalInput").value = state.profile.jpDailyGoal;
    $("#yueDailyGoalInput").value = state.profile.yueDailyGoal;
    const retention = Math.round(clamp(Number(state.profile.fsrsRetention) || 0.90, 0.80, 0.97) * 100);
    $("#fsrsRetentionInput").value = retention;
    $("#fsrsRetentionValue").value = `${retention}%`;
    $("#fsrsRetentionValue").textContent = `${retention}%`;
    $("#profileStats").innerHTML = `
      <div class="profile-stat"><strong>${state.xp.jp}</strong><span>Japanese XP</span></div>
      <div class="profile-stat"><strong>${state.xp.yue}</strong><span>Cantonese XP</span></div>
      <div class="profile-stat"><strong>${learnedEntries().length}</strong><span>base items encountered</span></div>
      <div class="profile-stat"><strong>${streak()}</strong><span>day streak</span></div>`;
    $("#jpNeuralFirst").checked = state.audio?.jpNeuralFirst !== false;
    renderAudioStatus();
    ensureVoices().then(() => { populateVoiceSelectors(); renderAudioStatus(); });
    showDialog($("#profileDialog"));
  }

  function saveProfile() {
    const existingAudio = state.audio;
    state.profile = {
      name: $("#profileNameInput").value.trim() || "Learner",
      jpTarget: $("#jpTargetInput").value,
      yueTarget: $("#yueTargetInput").value,
      jpDailyGoal: Math.max(1, Math.round(Number($("#jpDailyGoalInput").value) || 30)),
      yueDailyGoal: Math.max(1, Math.round(Number($("#yueDailyGoalInput").value) || 30)),
      fsrsRetention: clamp((Number($("#fsrsRetentionInput").value) || 90) / 100, 0.80, 0.97)
    };
    state.audio = existingAudio || state.audio;
    saveState();
    closeDialog($("#profileDialog"));
    showToast("Settings saved locally.");
  }

  function languageAccuracy(lang) {
    const answers = state.answers[lang];
    const total = answers.correct + answers.wrong;
    return total ? Math.round((answers.correct / total) * 100) : 0;
  }

  function skillDueCount(lang, skill) {
    const prefix = lang === "jp" ? "jp" : "yue";
    const now = Date.now();
    return Object.entries(state.skillSrs || {}).reduce((count, [key, bucket]) => {
      if (!key.startsWith(prefix)) return count;
      const record = bucket?.[skill];
      return count + ((record?.seen || 0) > 0 && (Number(record.card?.due) || 0) <= now ? 1 : 0);
    }, 0);
  }

  function renderSkillMatrix(lang) {
    return `<section class="skill-matrix-block">
      <div class="skill-matrix-head"><div><span>${lang === "jp" ? "日本語" : "廣東話"}</span><h3>${lang === "jp" ? "Japanese" : "Cantonese"} skill memory</h3></div><strong>${languageMastery(lang)}% overall</strong></div>
      <div class="skill-matrix">
        ${SKILLS.map(skill => {
          const mastery = languageSkillMastery(lang, skill);
          const due = skillDueCount(lang, skill);
          return `<article class="skill-metric-card">
            <div><span>${escapeHtml(SKILL_LABELS[skill])}</span><strong>${mastery}%</strong></div>
            <div class="skill-meter"><i style="width:${mastery}%"></i></div>
            <small>${due ? `${due} due now` : "No due reviews"}</small>
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  function openProgress() {
    const rows = [
      ["Japanese grammar", "jpG"],
      ["Japanese vocabulary", "jpV"],
      ["Cantonese grammar", "yueG"],
      ["Cantonese vocabulary", "yueV"],
      ["Japanese casual language", "jpC"],
      ["Cantonese casual language", "yueC"]
    ];
    const retention = Math.round((Number(state.profile.fsrsRetention) || 0.90) * 100);
    $("#progressDashboard").innerHTML = `
      <div class="progress-kpis">
        <div class="progress-kpi"><strong>${state.xp.jp}</strong><span>Japanese XP</span></div>
        <div class="progress-kpi"><strong>${state.xp.yue}</strong><span>Cantonese XP</span></div>
        <div class="progress-kpi"><strong>${dueEntries().length}</strong><span>base items with something due</span></div>
        <div class="progress-kpi"><strong>${retention}%</strong><span>FSRS desired retention</span></div>
      </div>
      <div class="progress-targets">
        <div><span>Japanese target</span><strong>${escapeHtml(state.profile.jpTarget)}</strong><small>${escapeHtml(targetScopeText("jp"))}</small></div>
        <div><span>Cantonese target</span><strong>${escapeHtml(state.profile.yueTarget)}</strong><small>${escapeHtml(targetScopeText("yue"))}</small></div>
      </div>
      <div class="skill-analytics-stack">${renderSkillMatrix("jp")}${renderSkillMatrix("yue")}</div>
      <section class="dataset-mastery-block"><div class="dataset-mastery-head"><span>BASE ITEM COVERAGE</span><p>Aggregate mastery across any skill you have practiced for each vocabulary or grammar item.</p></div>
      <div class="mastery-table">
        ${rows.map(([label, prefix]) => {
          const entries = learnedEntries().filter(entry => entry.kind === prefix);
          const mastery = entries.length ? Math.round(entries.reduce((sum, entry) => sum + (entry.srs.mastery || 0), 0) / entries.length) : 0;
          return `<div class="mastery-row"><span>${label} · ${entries.length}</span><div class="mastery-bar"><i style="width:${mastery}%"></i></div><strong>${mastery}%</strong></div>`;
        }).join("")}
      </div></section>`;
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
    const audio = { ...(state.audio || {}) };
    const quality = { ...defaultState().quality, ...(state.quality || {}), reports: { ...(state.quality?.reports || {}) } };
    state = defaultState();
    state.profile = profile;
    state.preferredStudyLanguage = preferredStudyLanguage;
    state.audio = audio;
    state.quality = quality;
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
      else if (action === "casual-lab") { openStudy(); $("#studyFocus").value = "casual"; }
      else if (action === "close-review") closeDialog(reviewDialog);
      else if (action === "usage-lab") { setLabMode(labMode); showDialog(usageDialog); }
      else if (action === "close-usage") closeDialog(usageDialog);
      else if (action === "context-browser") openContextBrowser();
      else if (action === "close-context-browser") closeDialog(contextBrowserDialog);
      else if (action === "data-library") openLibrary();
      else if (action === "close-library") closeDialog(libraryDialog);
      else if (action === "profile") { renderQualitySummary(); openProfile(); }
      else if (action === "close-profile") closeDialog($("#profileDialog"));
      else if (action === "progress") openProgress();
      else if (action === "close-progress") closeDialog($("#progressDialog"));
      else if (action === "close-clear-progress") closeDialog($("#clearProgressDialog"));
      else if (action === "close-quality-report") closeDialog($("#qualityReportDialog"));
      else if (action === "close-quality-manager") closeDialog($("#qualityManagerDialog"));
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
    if (!entry) return;
    if (entry.practiceMode?.startsWith("listening") && study.revealed) {
      speakItemHighlighted(entry.kind, entry.item, $("#studySyncTranscriptText"));
    } else speakItem(entry.kind, entry.item);
  });
  $("#replaySyncTranscript").addEventListener("click", event => {
    event.stopPropagation();
    const entry = study.items[study.index];
    if (entry) speakItemHighlighted(entry.kind, entry.item, $("#studySyncTranscriptText"));
  });
  $("#speakPassage").addEventListener("click", () => {
    const entry = study.items[study.index];
    if (entry?.kind.endsWith("P")) speakItem(entry.kind, entry.item);
  });
  $("#replayListeningPassage").addEventListener("click", () => {
    const entry = study.items[study.index];
    if (entry?.kind.endsWith("P")) speakItem(entry.kind, entry.item);
  });
  $("#replayPassageResult").addEventListener("click", () => {
    const entry = study.items[study.index];
    if (entry?.kind.endsWith("P")) speakItemHighlighted(entry.kind, entry.item, $("#passageResultTranscript"));
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
    const entry = reviewCurrentPractice || reviewQueue[reviewIndex];
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


  document.addEventListener("click", event => {
    const reportButton = event.target.closest("[data-report-example]");
    if (reportButton) { event.preventDefault(); event.stopPropagation(); openQualityReport(reportButton.dataset.reportExample); return; }
    const toggleButton = event.target.closest("[data-quality-toggle-hide]");
    if (toggleButton) {
      const report = state.quality?.reports?.[toggleButton.dataset.qualityToggleHide];
      if (report) { report.hidden = !report.hidden; report.updatedAt = Date.now(); saveState(); renderQualitySummary(); renderQualityManager(); }
      return;
    }
    const deleteButton = event.target.closest("[data-quality-delete]");
    if (deleteButton) {
      if (state.quality?.reports?.[deleteButton.dataset.qualityDelete]) { delete state.quality.reports[deleteButton.dataset.qualityDelete]; saveState(); renderQualitySummary(); renderQualityManager(); }
    }
  });
  $("#saveQualityReport").addEventListener("click", saveQualityReport);
  $("#openQualityReports").addEventListener("click", openQualityManager);
  $("#hideReportedExamples").addEventListener("change", event => {
    state.quality ||= { reports: {}, hideReported: true };
    state.quality.hideReported = event.target.checked;
    saveState();
    renderQualitySummary();
  });

  ["#jpVoiceSelect", "#yueVoiceSelect"].forEach(selector => {
    $(selector).addEventListener("change", event => {
      state.audio ||= { jpVoiceId: "", yueVoiceId: "", jpNeuralFirst: true };
      state.audio[selector === "#jpVoiceSelect" ? "jpVoiceId" : "yueVoiceId"] = event.target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAudioStatus();
    });
  });

  $("#jpNeuralFirst").addEventListener("change", event => {
    state.audio ||= { jpVoiceId: "", yueVoiceId: "", jpNeuralFirst: true };
    state.audio.jpNeuralFirst = event.target.checked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAudioStatus();
  });

  $("#refreshAudioVoices").addEventListener("click", async () => {
    await ensureVoices();
    refreshVoices();
    renderAudioStatus();
    showToast("Browser voice list refreshed.");
  });
  $("#testJapaneseAudio").addEventListener("click", () => speakItem("jpS", { text: "東京都内の新しい地下鉄路線について、国際交流センターで説明を聞きました。", translation: "I listened to an explanation at the international exchange center about a new subway line in Tokyo." }));
  $("#testCantoneseAudio").addEventListener("click", () => speakItem("yueS", { text: "而家測試廣東話發音。" }));

  $("#fsrsRetentionInput").addEventListener("input", event => {
    const value = `${Math.round(Number(event.target.value) || 90)}%`;
    $("#fsrsRetentionValue").value = value;
    $("#fsrsRetentionValue").textContent = value;
  });
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

  [libraryDialog, contextBrowserDialog, studyDialog, reviewDialog, usageDialog, $("#profileDialog"), $("#progressDialog"), $("#clearProgressDialog"), $("#qualityReportDialog"), $("#qualityManagerDialog")].forEach(dialog => {
    dialog?.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });

  window.AIDA_DEBUG = {
    source,
    state: () => state,
    contextVariations,
    contextPassageEntry,
    materializeProductionEntry,
    materializeListeningEntry,
    materializeStudyEntry,
    studyPool,
    languageSkillMastery,
    dueSkillForKey,
    scheduleEntry,
    skillRecordFor,
    fsrsRatingPreview,
    coherentQuestions,
    primarySemanticDomain,
    itemKey,
    byId
  };

  populateLibraryControls();
  setLabMode("ja");
  renderDashboard();
  renderQualitySummary();

})();
