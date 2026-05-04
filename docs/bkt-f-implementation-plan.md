# BKT-F: план внедрения гранулярной оценки знаний

> Дата: 2026-03-25 (обновлено: 2026-05-03)
> Статус: реализовано (все этапы завершены, включая Focus Slots)

Документ фиксирует принятые решения и открытые вопросы по внедрению системы гранулярной оценки знаний на основе BKT-F (Bayesian Knowledge Tracing with Forgetting).

- ✅ — решение принято или концепция ясна, можно имплементировать
- ☐ — открытый вопрос или работа которую предстоит выполнить

---

## 1. Концепция: что и зачем

✅ **Цель** — перейти от «средней температуры по больнице» (5 skill dimensions) к микроуровневому трекингу: знать уровень пользователя по каждому конкретному правилу и каждому слову.

✅ **Единица знания — KC (Knowledge Component)** — минимальная тестируемая единица:
```
vocab/give_up
grammar/present_perfect/since_vs_for
spelling/necessary
collocation/make_decision
```

✅ **Один механизм для всех категорий** — vocab, grammar, spelling, collocation живут в одной структуре, обновляются одним алгоритмом.

✅ **Гранулярность — Вариант C** (отдельный KC на каждое слово/правило), не топики-агрегаты. Агрегат уровня «тема» вычисляется поверх KC при необходимости отображения.

✅ **Сложность живёт в KC, не в вопросе** — вопросы являются наблюдениями KC (правильно/неправильно). Difficulty KC определяется через PRIOR (вероятность знать до первой попытки) и LEARN (скорость усвоения). Из параметров вопроса остался только `slip` — вероятность ошибиться при знании. Параметры IRT (difficulty, discriminability, guessing) удалены как не используемые в BKT-F.

---

## 2. Таксономия KC

✅ **Префиксы категорий:**
```
vocab/*        — отдельные слова и фразовые глаголы
grammar/*      — грамматические правила (иерархия через двоеточие)
spelling/*     — правописание конкретных слов
collocation/*  — устойчивые сочетания
```

✅ **Формат идентификатора:**
```
vocab/give_up
grammar/present_perfect/since_vs_for
grammar/modal_verbs/should_have_done
spelling/necessary
collocation/make_decision
```

✅ **Составить реальный каталог KC** — 368 KC для уровней A1–B2, задокументированы в `docs/kc-catalog.md`.
> Источники: English Grammar Profile (EGP, Cambridge), Oxford 3000, NGSL, Cambridge EVP (phrasal verbs), Murphy «English Grammar in Use». Приоритизированы KC с высоким риском ошибки для русскоговорящих.
>
> **Исходные данные (для справки):** Каталог не нужно составлять с нуля — существуют готовые лингвистические ресурсы:
>
> **Grammar KC:**
> - [English Grammar Profile (EGP)](https://www.englishprofile.org/english-grammar-profile) — Cambridge English исследование: какие грамматические структуры появляются на каждом CEFR уровне на основе корпуса реальных учащихся. Открытый онлайн-поиск, ~1200 грамматических пунктов с CEFR-разметкой. Лучший источник для grammar KC.
> - Структура глав Raymond Murphy «English Grammar in Use» (A2–B2) и «Essential Grammar in Use» (A1–A2) — педагогически обоснованный порядок тем, широко принятый в ELT.
> - Cambridge English exam syllabi (KET/A2, PET/B1, FCE/B2) — публичные списки грамматических тем для каждого уровня.
>
> **Vocab KC:**
> - [English Vocabulary Profile (EVP)](https://www.englishprofile.org/wordlists) — Cambridge English: слова и фразы с CEFR-разметкой на основе learner corpus. Показывает на каком уровне слово реально усваивается (не просто встречается).
> - [Oxford 3000 + Oxford 5000](https://www.oxfordlearnersdictionaries.com/wordlist/) — открытый список с A1–C1 разметкой, специально для изучающих.
> - [NGSL (New General Service List)](http://www.newgeneralservicelist.org/) — 2818 наиболее частотных слов, corpus-based, открытый, покрывает ~92% разговорного английского.
>
> **Специфика Russian→English:**
> - Приоритизировать KC которые труднее всего для русскоговорящих: артикли (в русском нет), видо-временные формы (vs русский вид), фразовые глаголы, предлоги. Источник: [Swan & Smith «Learner English»](https://www.cambridge.org/gb/cambridgeenglish/catalog/teacher-training-and-development/learner-english) — глава по русскоязычным.
>
> **Практический подход:** взять EGP для grammar KC + Oxford 3000/EVP для vocab KC → получить ~200 grammar KC и ~3000 vocab KC с готовой CEFR-разметкой. Отфильтровать до реалистичного объёма для старта.

✅ **Назначить CEFR уровень каждому KC** (A1/A2/B1/B2) — основа для курикулума. Реализовано в `seed/kc-catalog.jsonl` (368 KC).
> 🔍 **Исследование:** Для большинства KC уровень уже определён источниками выше (EGP, EVP, Oxford 3000). Ключевой вопрос — как разрешать конфликты когда разные источники дают разный уровень для одного KC? EGP основан на learner corpus (что реально усваивается), учебники — на педагогической традиции. Learner corpus точнее для нашей задачи.

☐ **Определить источник частотности словаря** — Oxford 3000, COCA, English Profile или другой. Используется для упорядочивания vocab KC внутри уровня.
> 🔍 **Исследование:** Сравнить Oxford 3000 (свободный, специально для изучающих), COCA (corpus-based, Academic), English Vocabulary Profile (привязан к CEFR, платный). Ключевые вопросы: какой список лучше отражает практическую частотность для русскоговорящих изучающих? Есть ли открытый список с CEFR-разметкой? Рассмотреть: [Oxford 3000](https://www.oxfordlearnersdictionaries.com/wordlist/english/oxford3000/), [EVP Online](https://www.englishprofile.org/wordlists), [NGSL](http://www.newgeneralservicelist.org/) (New General Service List, corpus-based, открытый).

✅ **Разметить существующие вопросы** — поле `kcs: string[]` добавлено ко всем вопросам в `seed/questions.json`. Каждый вопрос → 1–3 KC.

☐ **Определить стратегию смешивания в курикулуме** — чередовать grammar и vocab внутри уровня или сначала весь grammar A1, затем vocab A1?
> 🔍 **Исследование:** Interleaving effect (Bjork Lab) говорит что чередование улучшает долгосрочное запоминание vs блочное изучение. Но применительно к grammar+vocab/ есть ли исследования о пользе/вреде смешивания разных категорий (а не только вариантов внутри одной)? Ключевой вопрос: грамматика и лексика — разные когнитивные системы, не мешает ли их чередование? Источники: Bjork Lab research, Duolingo blog posts о структуре курсов, Cambridge English Teacher resources по sequencing.

---

## 3. Состояние знания пользователя

✅ **Три числа на пару (пользователь, KC):**
```
KNOWN      — вероятность что пользователь знает KC прямо сейчас [0, 1]
HALF_LIFE  — через сколько дней без практики KNOWN упадёт вдвое
lastSeen   — timestamp последней практики
```

✅ **Флаг консолидации:**
```
consolidated — KC выучен навсегда, заморожен
```

✅ **Текущий KNOWN вычисляется лениво** — не хранится, не обновляется в фоне:
```
currentKNOWN = KNOWN × 2^(-Δt / HALF_LIFE)
где Δt = (now - lastSeen) в днях
```

✅ **Никаких фоновых заданий** для пересчёта — только в момент запроса.

---

## 4. Параметры алгоритма

### Константы

✅ **HL_MAX = 365** — максимальный half-life (дней). Потолок для роста при успехе.

✅ **GUESS = 1 / количество вариантов ответа**
Единственный параметр прямо определяемый структурой вопроса.
```
4 кнопки → GUESS = 0.25
6 кнопок → GUESS = 0.17
```

✅ **SLIP = 0.10** — вероятность ошибиться при знании (глобальная константа на старте).

✅ **LEARN разделён на два параметра:**
```
LEARN_correct = 0.20  — при правильном ответе (быстрое усвоение)
LEARN_wrong   = 0.05  — при неправильном ответе (минимальный exposure-эффект)
```
> **Обоснование:** единый LEARN=0.20 создавал математический пол ~0.231 — при любом количестве неправильных ответов known не опускался ниже этого значения, что противоречит логике. Разделение решает проблему: пол при ошибках опускается до ~0.058, wrong answers реально снижают known. Скорость обучения при правильных ответах не меняется (4–5 вопросов до порога 0.95).

✅ **PRIOR = 0.10** — начальное знание нового KC. Выбран выше равновесного пола (~0.058) чтобы первый неправильный ответ снижал known, а не повышал.

✅ **Мультипликаторы HALF_LIFE:**
```
Правильный ответ:    min(365, HALF_LIFE × 2.0)
Неправильный ответ:  max(0.5, HALF_LIFE × 0.5)
```

✅ **Начальный HALF_LIFE = 1.0 день** для нового KC.

### Пороги

✅ **Порог мастерства:** KNOWN >= 0.95

✅ **Порог консолидации:** KNOWN >= 0.95 И HALF_LIFE >= 64 дней (≈ 6–7 успешных повторений с нарастающими интервалами)

✅ **Порог перехода в расписание:** KNOWN >= 0.70 (ниже — всегда в активном пуле)

✅ **Плавная де-консолидация** (заменила фиксированные значения):
```
known = max(0.50, known × 0.70)
halfLife = max(4.0, halfLife × 0.25)
```

### Открытые вопросы по параметрам

☐ **Per-KC значения LEARN_correct, LEARN_wrong, SLIP, PRIOR** — после накопления данных (1K+ ответов на KC). Сложные KC: LEARN_correct ниже, PRIOR ниже. Частотные слова: PRIOR выше.
> 🔍 **Исследование:** Изучить типичные диапазоны параметров BKT по литературе для разных типов KC. pyBKT содержит датасеты с откалиброванными параметрами (ASSISTments dataset). Ключевые вопросы: каковы типичные значения LEARN для грамматических правил vs словаря? Есть ли публичные датасеты по изучению английского с BKT-параметрами? Источники: [pyBKT datasets](https://github.com/CAHLR/pyBKT), ASSISTments dataset, Carnegie Learning публикации по MATHia (аналогичный домен).

☐ **Per-KC значение HALF_LIFE** — порог консолидации 64 дня универсален или нужна дифференциация по сложности KC?
> 🔍 **Исследование:** FSRS-бенчмарки содержат распределение Stability (S) по типам карточек. Есть ли значимая разница S между простыми словами и сложными грамматическими правилами? Ключевой вопрос: оправдывает ли разница в данных усложнение модели (per-KC порог консолидации)? Источники: [SRS Benchmark](https://github.com/open-spaced-repetition/srs-benchmark), [FSRS Algorithm Explanation](https://expertium.github.io/Algorithm.html) — секция о распределении Stability.

☐ **Веса формулы приоритета** (0.5 / 0.5) — гипотеза. Требует A/B тестирования.
> 🔍 **Исследование:** Есть ли литература по оптимальному балансу между «нужда в знании» (need) и «срочность повторения» (urgency) в адаптивных системах? Duolingo публиковал исследования об оптимальном scheduling. Ключевой вопрос: что важнее для language learning — учить слабые KC или повторять забывающиеся? Источники: Duolingo Research blog, Settles & Meeder ACL 2016 (HLR), поиск по «adaptive learning priority weighting spaced repetition».

☐ **Пороги корзин** (0.60 / 0.30) — гипотеза. Требует калибровки по данным.
> 🔍 **Исследование:** Как Duolingo и аналогичные системы делят KC на категории «требует внимания сейчас» vs «на поддержании»? Есть ли публичные данные об оптимальном распределении сессии между слабыми/средними/новыми KC? Источник: Duolingo Engineering Blog, [Duolingo Research](https://research.duolingo.com/).

---

## 5. Формула обновления BKT-F

✅ **Четыре шага после каждого ответа:**

**Шаг 1 — забывание по времени:**
```
KNOWN_after_forget = KNOWN × 2^(-Δt / HALF_LIFE)
```

**Шаг 2 — байесовское обновление (что говорит ответ о знании):**
```
Правильно:
  KNOWN_obs = KNOWN_after_forget × (1 - SLIP)
              ─────────────────────────────────────────────────────────
              KNOWN_after_forget × (1 - SLIP) + (1 - KNOWN_after_forget) × GUESS

Неправильно:
  KNOWN_obs = KNOWN_after_forget × SLIP
              ───────────────────────────────────────────────────────────────────
              KNOWN_after_forget × SLIP + (1 - KNOWN_after_forget) × (1 - GUESS)
```

**Шаг 3 — обучение:**
```
Правильно:    KNOWN_new = KNOWN_obs + (1 - KNOWN_obs) × LEARN_correct
Неправильно:  KNOWN_new = KNOWN_obs + (1 - KNOWN_obs) × LEARN_wrong

Стандартный режим:     LEARN_correct = 0.20, LEARN_wrong = 0.05
Exposure mode (yes_no): LEARN_correct = 0.15, LEARN_wrong = 0.10
```

**Шаг 4 — обновление HALF_LIFE:**
```
Правильно:    HALF_LIFE_new = HALF_LIFE × 2.0
Неправильно:  HALF_LIFE_new = max(0.5, HALF_LIFE × 0.5)
```

✅ **Числовой пример** — KC с KNOWN=0.50, HALF_LIFE=4 дня, 4 варианта, Δt=0:
```
Правильный ответ:
  KNOWN_obs = 0.50×0.90 / (0.50×0.90 + 0.50×0.25) = 0.783
  KNOWN_new = 0.783 + 0.217×0.20 = 0.826
  HALF_LIFE = 8 дней

Неправильный ответ:
  KNOWN_obs = 0.50×0.10 / (0.50×0.10 + 0.50×0.75) = 0.118
  KNOWN_new = 0.118 + 0.882×0.05 = 0.162
  HALF_LIFE = 2 дня
```

---

## 6. Консолидация — «выучено навсегда»

✅ **Условие:** KNOWN >= 0.95 И HALF_LIFE >= 64 дней — достигается после ~7 успешных повторений с нарастающими интервалами.

✅ **Что происходит при консолидации:**
- `consolidated = true`
- KNOWN и HALF_LIFE заморожены — формула забывания не применяется
- KC исключается из активной ротации и расписания навсегда

✅ **Де-консолидация** — только при явной ошибке на этом KC:
```
consolidated = false
KNOWN = max(0.50, KNOWN × 0.70)   (пропорционально текущему знанию)
HALF_LIFE = max(4.0, HALF_LIFE × 0.25)  (пропорционально текущей устойчивости)
```

✅ **Мотивация решения:** без заморозки KNOWN деградирует со временем и система показывает примитивные вопросы ниже реального уровня пользователя. Закрытый цикл бота не учитывает внешнее подкрепление (чтение, просмотр видео).

---

## 7. Расписание повторений

✅ **Хранимое поле `nextReviewAt`** — когда KNOWN упадёт до 50%:
```
nextReviewAt = lastSeen + HALF_LIFE × log₂(KNOWN / 0.5) дней
```

✅ **KC в активном изучении** (KNOWN < 0.70) → `nextReviewAt = 0` (всегда в пуле).

✅ **Запрос только по индексу** `by_user_nextReview` — возвращает 10–20 записей, не все KC пользователя.

✅ **Никакого cron-job** — HALF_LIFE не пересчитывается в фоне. Всё лениво.

---

## 8. Выбор следующего вопроса

> ✅ **Реализовано.** Стратегия «три корзины» заменена на drill-ориентированный подход **Focus Slots**.
> Полное описание: [docs/focus-slots-design.md](focus-slots-design.md).
>
> Формула `computePriority()` сохраняется — используется для заполнения слотов.
> Три корзины (A/B/C) заменены на роли слотов (drill/new/review) с каскадом приоритетов.

### Формула приоритета

✅ **Две компоненты (используется Focus Slots для ранжирования KC):**
```
need    = 1 - currentKNOWN              (как слабо знает прямо сейчас)
urgency = 1 - 2^(-Δt / HALF_LIFE)      (как сильно забыл с последней практики)

priority = 0.5 × need + 0.5 × urgency
```

### ~~Три корзины~~ → Focus Slots

Заменено. См. [focus-slots-design.md](focus-slots-design.md).

---

## 9. Введение нового материала — курикулум

✅ **Курикулум** — все KC отсортированы по сложности/частотности от A1 до B2. У пользователя хранится указатель на текущую позицию.

✅ **Окно размером 10** — случайный выбор среди 10 следующих непосещённых KC после указателя.

✅ **Указатель двигается** когда KC из окна достигает KNOWN >= 0.70 — KC уходит в расписание, новый входит в окно.

✅ **Смешанный курикулум** — vocab, grammar, spelling вместе в одном потоке.

✅ **Выбор нового KC из kcCatalog** — через `random` field (O(1)), точечный lookup в `userMastery` для проверки (не полная загрузка известных KC).

☐ **Конкретный порядок KC в курикулуме** — как упорядочить тысячи vocab KC и сотни grammar KC в единый список?
> 🔍 **Исследование:** Изучить существующие открытые силлабусы A1–B2 для определения порядка грамматических тем. Источники: Cambridge English Syllabus, English Grammar in Use (Murphy) — структура глав отражает педагогически обоснованный порядок. Для vocab/ NGSL или Oxford 3000 уже отсортированы по частотности. Ключевой вопрос: нужен ли специальный порядок для Russian→English learners или универсальный силлабус достаточен?

☐ **Переход между CEFR уровнями** — при каком % освоения текущего уровня переходить на следующий?
> 🔍 **Исследование:** Что считать «освоением уровня»? Варианты: (a) X% KC уровня достигли KNOWN >= 0.70; (b) X% KC уровня consolidated; (c) фиксированное число KC уровня в активном расписании. Изучить: как CEFR определяет переход между уровнями — есть ли количественные критерии в официальных документах? Источник: [CEFR Companion Volume](https://www.coe.int/en/web/common-european-framework-reference-languages).

---

## 10. Схема данных

### Новые таблицы

✅ **Таблица `kcCatalog`** — мастер-каталог всех KC.

```typescript
kcCatalog: defineTable({
  kcId:      v.string(),   // "grammar/present_time/be_am_is_are" — стабильный идентификатор
  category:  v.union(
    v.literal("grammar"),
    v.literal("vocab"),
    v.literal("collocation"),
    v.literal("spelling"),
  ),
  cefrLevel: v.union(
    v.literal("A1"), v.literal("A2"),
    v.literal("B1"), v.literal("B2"),
  ),
  sortOrder:   v.number(),   // глобальная позиция в курикулуме (A1→B2, внутри уровня по сложности)
  random:      v.number(),   // [0,1) — для O(1) случайного выбора нового KC
  description: v.optional(v.string()), // краткое описание для методологов
})
  .index("by_kcId",        ["kcId"])               // точечный lookup по строке
  .index("by_cefr_random", ["cefrLevel", "random"]) // случайный KC внутри уровня
  .index("by_sortOrder",   ["sortOrder"])           // последовательный проход по курикулуму
```

✅ **Таблица `questionKcs`** — M:M связь вопросов и KC.

```typescript
questionKcs: defineTable({
  questionId: v.id("questions"),
  kcId:       v.string(),     // FK → kcCatalog.kcId
  isPrimary:  v.boolean(),    // true = основной KC; false = вторичный (получает 0.5× LEARN)
})
  .index("by_question", ["questionId"])  // все KC вопроса
  .index("by_kc",       ["kcId"])        // все вопросы для KC → выбор вопроса по KC
```

> **Решение по multi-KC вопросам:** первый KC в `kcs[]` становится primary (полное BKT-обновление), остальные — secondary (LEARN × 0.5). Простое и предсказуемое поведение без Q-Matrix усложнений.

✅ **Таблица `userMastery`** — состояние знания (пользователь, KC).

```typescript
userMastery: defineTable({
  telegramUserId: v.string(), // натуральный ключ — консистентно с answerLog
  kcId:           v.string(), // FK → kcCatalog.kcId
  known:          v.number(), // P(Known) на момент lastSeen [0,1]
  halfLife:       v.number(), // дней до снижения вдвое
  lastSeen:       v.number(), // timestamp последней практики (ms)
  nextReviewAt:   v.number(), // timestamp когда known упадёт до 0.5 (0 = всегда активен)
  consolidated:   v.boolean(),
})
  .index("by_user_kc",         ["telegramUserId", "kcId"])          // lookup + upsert
  .index("by_user_nextReview", ["telegramUserId", "nextReviewAt"])  // расписание
```

### Изменения существующих таблиц

✅ **`questions`** — добавить `kcs` (денормализация для отображения и seed-валидации):

```typescript
kcs: v.optional(v.array(v.string())),  // KC IDs, дублирует questionKcs для удобства
```

✅ **`users`** — добавить `curriculumPointer`:

```typescript
curriculumPointer: v.optional(v.number()),  // sortOrder последнего введённого KC
```

### Сид-файлы

✅ **`seed/kc-catalog.jsonl`** — мастер-источник каталога KC:

```jsonc
[
  {
    "kcId": "grammar/present_time/be_am_is_are",
    "category": "grammar",
    "cefrLevel": "A1",
    "sortOrder": 1,
    "description": "Выбор am/is/are по подлежащему. Вопросы: вставить форму, исправить ошибку."
  },
  ...
]
```

> `description` — краткое описание для методологов: что именно тестируется и какие форматы вопросов типичны для KC. Хранится в `kcCatalog` в БД. Подробный каталог с развёрнутыми описаниями — в `docs/kc-catalog.md`.

> `random` генерируется seed-скриптом (не хранится в JSON) — аналогично `questions.random`.

✅ **`seed/questions.json`** — каждый вопрос получает поле `kcs`:

```jsonc
{
  "id": 1,
  "kcs": ["grammar/present_time/present_simple", "vocab/do"],  // первый = primary KC
  ...
}
```

✅ **Валидация cross-reference** — `seed/validate.ts` проверяет, что каждый KC из `questions[*].kcs` присутствует в `kc-catalog.jsonll`. Неизвестные KC = ошибка.

✅ **`seed/seed.mjs`** расширяется двумя дополнительными шагами:
1. Очистить и заполнить `kcCatalog` из `kc-catalog.jsonl` (с генерацией `random`)
2. Очистить и заполнить `questionKcs` из `kcs[]` каждого вопроса

### Вопросы с несколькими KC

✅ **Стратегия обновления при kcs.length > 1** — первый KC в `kcs[]` = primary (полное BKT-обновление), остальные = secondary (LEARN × 0.5). Решение принято в пользу простоты; revisit после накопления данных.

### Cold start нового пользователя

✅ **PRIOR — популяционный, единый для всех** — глобальный PRIOR=0.10 для всех пользователей и всех KC. Это популяционная оценка, не персональная. BKT-F быстро сходится: после 2–3 правильных ответов `known` отражает реальность независимо от стартового PRIOR. После накопления данных (Этап 9) PRIOR заменится на aggregate correct rate по KC из реальных ответов.

✅ **Placement test — не используется** — все пользователи стартуют с A1, PRIOR=0.10. Система самокалибруется: пользователь с реальным B2 уровнем даёт правильные ответы на A1/A2 KC, `known` достигает порога 0.70 после 2 правильных ответов, `curriculumPointer` быстро продвигается. Никаких деклараций от пользователя не требуется и не предусмотрено.

✅ **Заявленный уровень — не используется** — бот не запрашивает и не хранит самооценку уровня пользователя. Единственная оценка уровня — вычисляемая системой через `userMastery`.

### Yes/No вопросы — exposure mode

✅ **GUESS = 0.50** — yes_no вопросы работают в **exposure mode**. Байесовский шаг (шаг 2) выполняется штатно, но при GUESS=0.50 он практически не меняет KNOWN — слабый диагностический сигнал. Основной эффект — через обучение (шаг 3) с отдельными LEARN-значениями:
```
LEARN_correct_exposure = 0.15  (ниже стандартного 0.20 — мини-урок, а не тест)
LEARN_wrong_exposure   = 0.10  (выше стандартного 0.05 — повышенный exposure-эффект)
```
> **Решение (2026-03-26):** вместо пропуска шагов алгоритма — единый pipeline с разными LEARN-значениями. Флаг `isExposure = (choiceType === "yes_no")` передаётся в `bktUpdate()`. Half-life обновляется стандартно (×2.0/×0.5). Реализовано в `convex/bkt/bktPure.ts`.

### Существующая система

☐ **Судьба 5-мерного Elo** в `skillProfiles` — упразднить? Оставить как агрегат поверх KNOWN по категориям?

☐ **Bootstrap из `answerLog`** — можно ли инициализировать userMastery для существующих пользователей по их истории ответов?

### Технические зависимости

☐ **Проверить ts-fsrs в Convex runtime** — нужно для возможной будущей миграции на FSRS-расписание.

---

## 11. Метрики успеха

☐ **Определить метрики** — как измерять что алгоритм работает:
- Retention rate (% правильных ответов на KC при nextReviewAt)
- Time to consolidation (медиана вопросов до consolidated)
- Session engagement (длина сессии, частота возврата)
> 🔍 **Исследование:** Изучить какие метрики используют Duolingo и Anki для оценки качества алгоритма. Из research.md: SRS Benchmark использует Log Loss и AUC для сравнения алгоритмов — применимо ли это к нашей задаче? Ключевой вопрос: как отделить «алгоритм работает хорошо» от «пользователь просто умный»? Источники: [SRS Benchmark methodology](https://github.com/open-spaced-repetition/srs-benchmark), Duolingo «Scaling Knowledge Tracing» blog post.

☐ **Порог для per-KC калибровки** — при каком объёме данных (ответов на KC) переходить от глобальных LEARN/SLIP к per-KC значениям?
> 🔍 **Исследование:** BKT-литература по минимальному числу наблюдений для стабильной оценки параметров. Из pyBKT документации: рекомендуется минимум 10–30 студентов × 5–10 попыток на KC для EM-алгоритма. В нашем случае: минимум 50–100 ответов на KC от разных пользователей. Проверить: есть ли в литературе более точные оценки для языковых KC? Источник: pyBKT paper (arXiv:2105.00385), Van de Sande 2013 «Properties of the Bayesian Knowledge Tracing Model».

---

## 12. Возможная миграция на FSRS

✅ **FSRS не нужен на старте.** BKT-F достаточен и проще.

✅ **Концептуальная связь:** HALF_LIFE в BKT-F ≈ S (Stability) в FSRS. Миграция при необходимости — замена формулы пересчёта, не смена архитектуры.

✅ **BKT-F имеет преимущество перед FSRS в нашем случае:** явное моделирование GUESS и SLIP — критично для SCQ формата. FSRS не моделирует угадывание.

☐ **Гибрид BKT+FSRS** — рассмотреть после накопления ~10K ответов: BKT для оценки KNOWN (с учётом GUESS/SLIP), FSRS для расписания (nextReviewAt по степенной кривой забывания).
> 🔍 **Исследование:** Проверить ts-fsrs совместимость с Convex runtime (минимальный smoke test: импорт + createEmptyCard() + fsrs.repeat()). Изучить как адаптировать бинарные ответы к 4-рейтинговой системе FSRS: правильно→Good, неправильно→Again — насколько это искажает Stability? Есть ли публикации о FSRS с бинарными ответами? Источники: [ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs), [FSRS open issues](https://github.com/open-spaced-repetition/fsrs4anki/issues) по бинарным ответам.

---

## Рекомендуемая последовательность внедрения

```
Этап 1 — Основания ✅
  ✅ Составить каталог KC — 368 KC в seed/kc-catalog.jsonl
  ✅ Принять решение по multi-KC вопросам (primary/secondary)
  ✅ Принять решение по схеме данных (см. раздел 10)
  ✅ Принять решение по cold start / placement test (без placement, PRIOR=0.10)

Этап 2 — Сид-файл каталога KC ✅
  ✅ Создать seed/kc-catalog.jsonl — 368 записей: { kcId, category, cefrLevel, sortOrder }
  ✅ Добавить Zod-схему для kc-catalog.jsonl в seed/schemas.ts
  ✅ Расширить seed/validate.ts для kc-catalog.jsonl

Этап 3 — Разметка вопросов ✅
  ✅ Добавить поле kcs: string[] в questionSchema (seed/schemas.ts)
  ✅ Добавить cross-reference проверку в validate.ts
      — каждый KC из kcs[] должен быть в kc-catalog.jsonl
  ✅ Проставить kcs[] для каждого вопроса в seed/questions.json

Этап 4 — Схема БД ✅
  ✅ Добавить таблицу kcCatalog в convex/schema.ts
  ✅ Добавить таблицу questionKcs в convex/schema.ts
  ✅ Добавить таблицу userMastery в convex/schema.ts
  ✅ Расширить таблицу questions полем kcs: v.array(v.string())
  ✅ Расширить таблицу users полем curriculumPointer: v.optional(v.number())
  ✅ make codegen — регенерировать API типы

Этап 5 — Расширение seed-процесса ✅
  ✅ Добавить convex/seed.ts: мутация replaceKcCatalog (очистить + вставить)
  ✅ Добавить convex/seed.ts: мутация replaceQuestionKcs (очистить + вставить из kcs[])
  ✅ Расширить seed/seed.mjs — шаг «заполнить kcCatalog» (с генерацией random)
  ✅ Расширить seed/seed.mjs — шаг «заполнить questionKcs» из kcs[]
  ✅ make seed — прогнать полный цикл, проверить данные

Этап 6 — Ядро алгоритма BKT-F ✅
  ✅ Реализовать bktUpdate() как чистую функцию (convex/bkt/bktPure.ts)
      — шаги 1-4 + exposure mode для yes_no вопросов
      — входы: { known, halfLife, lastSeen, now, isCorrect, choicesCount, slip, isPrimary, consolidated, isExposure }
      — выходы: { known, halfLife, nextReviewAt, consolidated }
  ✅ Реализовать computePriority() как чистую функцию
      — need + urgency формула из раздела 8
  ✅ Реализовать createInitialMastery() — начальные значения для нового KC
  ✅ Написать 25 юнит-тестов (числовой пример, forgetting, exposure mode, convergence, consolidation/de-consolidation, priority)

Этап 7 — Интеграция в бот (частично ✅)
  ☐ Convex query: getNextKc({ telegramUserId }) — три корзины + курикулум
  ☐ Convex query: getQuestionForKc({ kcId }) — случайный вопрос по KC
  ✅ Convex mutation: updateMastery (convex/userMastery.ts)
      — загружает вопрос, questionKcs, вызывает bktUpdate для каждого KC
      — возвращает MasteryUpdateEntry[] (before/after) для debug footer
  ☐ Заменить случайный выбор вопроса в QuestionManager.next() (отложен до обновления базы вопросов)
  ✅ Вызывать updateMastery из handleAnswer() / handleSkip()
      — handleAnswer: шаг 5 перед показом фидбека
      — handleSkip: шаг 4 с isCorrect=false

Этап 8 — Наполнение банка вопросов
  ☐ Добавить поле style в questions (Convex: v.optional(v.string()), Zod: z.enum([...]))
    — стиль/персона генерации: "methodist", "trap", "colleague", "office",
      "traveler", "popculture", "provocateur", "narrator", "child"
    — свободная строка в Convex (без миграции при новых персонах),
      enum-валидация в Zod seed-схеме
  ☐ Создать промпты для команды ИИ-ассистентов (9 персон):
    — Приоритет 1: Методист, Ловушка (ошибки русскоговорящих), Коллега (живая речь)
    — Приоритет 2: Офис (Business English), Путешественник, Попкультура
    — Приоритет 3: Провокатор (тонкие различия), Рассказчик (контекст), Ребёнок
  ☐ Генерация вопросов: целевой минимум 5–8 вопросов на KC (1840–2950 вопросов)
  ☐ Валидация и ревью сгенерированных вопросов

Этап 9 — Focus Slots (drill-ориентированный выбор)
  ☐ Добавить focusSlots + lastAnsweredAt в users (schema.ts)
  ☐ Реализовать fillSlot() с каскадом приоритетов (тиры 1–7 + fallback тир 8)
  ☐ Реализовать nextQuestion() с логикой слотов и таймаутом 30 мин
  ☐ Заменить случайный выбор в QuestionManager.next()
  ☐ Тесты: инициализация слотов, exit по streak, таймаут, каскад заполнения
  Подробности: docs/focus-slots-design.md

Этап 10 — Наблюдаемость
  ☐ Логировать kcId в answerLog (добавить поле или отдельную таблицу)
  ☐ Определить и начать измерять метрики успеха (retention rate, time-to-consolidation)

Этап 11 — Калибровка (после ~1K ответов)
  ☐ Per-KC параметры LEARN, SLIP, PRIOR
  ☐ Валидация параметров Focus Slots (EXIT_STREAK, таймаут, количество слотов)
```
