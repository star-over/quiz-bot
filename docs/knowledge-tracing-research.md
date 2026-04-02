# Исследование: гранулярная оценка знаний и адаптивный выбор вопросов

> Дата: 2026-03-19
> Статус: исследование завершено, ожидает имплементации

## Содержание

1. [Постановка задачи](#постановка-задачи)
2. [Обзор алгоритмов Knowledge Tracing](#обзор-алгоритмов-knowledge-tracing)
3. [Spaced Repetition: FSRS, HLR, SM-2](#spaced-repetition-fsrs-hlr-sm-2)
4. [Duolingo Birdbrain — production-система](#duolingo-birdbrain--production-система)
5. [Модели Knowledge Components](#модели-knowledge-components)
6. [Cold Start](#cold-start)
7. [Готовые реализации и библиотеки](#готовые-реализации-и-библиотеки)
8. [Рекомендуемая архитектура для quiz-bot](#рекомендуемая-архитектура-для-quiz-bot)
9. [Открытые вопросы для дальнейшего исследования](#открытые-вопросы-для-дальнейшего-исследования)
10. [Источники](#источники)

---

## Постановка задачи

Текущая модель: многомерный Elo-рейтинг по 5 skill dimensions (grammar, vocabulary, listening, reading, speaking). Это даёт «среднюю температуру по больнице» для каждого навыка.

Цель: перейти к **микроуровневому трекингу** — знать уровень пользователя по каждому конкретному правилу (артикли, Present Perfect, phrasal verbs) и каждому слову (узнавание, понимание на слух, произношение).

В литературе это называется **fine-grained Knowledge Tracing** — отслеживание отдельных Knowledge Components (KC).

---

## Обзор алгоритмов Knowledge Tracing

### BKT — Bayesian Knowledge Tracing

Corbett & Anderson, 1995. Классический алгоритм, используется в Carnegie Learning (MATHia).

Модель: Hidden Markov Model с бинарным латентным состоянием (знает / не знает). 4 параметра на каждый KC:

- `P(L₀)` — начальная вероятность знания
- `P(T)` — вероятность перехода «не знает → знает» после практики
- `P(S)` — slip: вероятность ошибки при знании
- `P(G)` — guess: вероятность угадать при незнании

После каждого ответа — байесовское обновление апостериорной вероятности.

**Плюсы**: чистая арифметика, полная интерпретируемость, нет зависимости от ML-инференса, проверен десятилетиями.

**Минусы**: бинарное состояние (знает / не знает — нет градации), каждый KC независим (нет связей между темами), нет модели забывания.

**Для quiz-bot**: хороший кандидат для per-topic трекинга, но бинарность ограничивает. Нужна модификация с continuous state.

### DKT — Deep Knowledge Tracing

Piech et al., 2015 (Stanford). LSTM/RNN поверх последовательности взаимодействий.

**Критика (Ding et al.)**: DKT учит «ability model», а не реально трекает навыки. Чувствителен к последним ответам (3 ошибки подряд → сильный bias). Необученные RNN дают сравнимые результаты.

**Для quiz-bot**: НЕПРИГОДЕН. Требует нейросетевого инференса на каждый запрос — несовместим с серверлесс-архитектурой Convex.

### SPARFA — Sparse Factor Analysis

Lan et al., 2014 (JMLR). Автоматически обнаруживает структуру KC через sparse factor analysis. Совместно определяет: какие концепции тестирует каждый вопрос, знание каждой концепции, сложность вопроса.

**Для quiz-bot**: НЕПРИГОДЕН для онлайн-обновления (требует батч-оптимизации). Полезен для офлайн-анализа вопрос-тема маппинга, если накопится достаточно данных.

### Современные подходы (2022-2026)

- **SAKT** (Self-Attentive KT): attention вместо LSTM, лучше для long-range зависимостей
- **ReKT**: сверхлёгкий — всего два линейных регрессионных блока (Forget-Response-Update). Перспективен для constrained environments
- **LLM-based KT** (2024+): LLM для понимания семантики упражнений при cold start (CLST framework)

**Важный вывод бенчмарков (EDM 2025)**: специализированные KT-модели по-прежнему превосходят LLM для задачи knowledge tracing.

---

## Spaced Repetition: FSRS, HLR, SM-2

### FSRS — Free Spaced Repetition Scheduler

Стандарт де-факто. Дефолтный алгоритм Anki с версии 23.10 (автор — Jarrett Ye).

**Три компоненты состояния (DSR model)**:
- **D** (Difficulty) — сложность элемента, диапазон [1, 10]
- **S** (Stability) — через сколько дней вероятность вспомнить падает до 90%
- **R** (Retrievability) — текущая вероятность вспомнить

**Кривая забывания — степенная** (не экспоненциальная!):

```
R(t) = (1 + F · t/S)^C
где F = 19/81, C = -0.5
```

**Расчёт интервала для целевого retention R_d:**

```
I = (S/F) · (R_d^(1/C) - 1)
```

**Обновление stability после правильного ответа:**

```
S' = S · (1 + e^W8 · (11-D) · S^(-W9) · (e^(W10·(1-R)) - 1) · hard_penalty · easy_bonus)
```

**Обновление stability после ошибки:**

```
S' = W11 · D^(-W12) · ((S+1)^W13 - 1) · e^(W14·(1-R))
```

**Обновление difficulty:**
Используется mean reversion: `D'' = W7·D0(4) + (1-W7)·D'`

FSRS-6 имеет **21 параметр** (W0-W20). Есть дефолтные значения для новых пользователей.

**Бенчмарк (1.7 миллиарда ревью, 20K пользователей):**

| Алгоритм       | Log Loss | AUC    |
|-----------------|----------|--------|
| **FSRS-7**      | **0.3418** | **0.7091** |
| FSRS-6          | 0.3460   | 0.7034 |
| FSRS-5          | 0.3560   | 0.7011 |
| HLR (Duolingo)  | 0.4694   | 0.6369 |
| Ebisu v2        | 0.4989   | 0.6051 |
| SM-2 (Anki)     | ~0.37    | ~0.68  |

FSRS даёт **на 20-30% меньше повторений** чем SM-2 при том же retention. Превосходит SM-2 в 99.6% случаев по log loss.

**Для quiz-bot**: лучший кандидат для scheduling. Есть **TypeScript-реализация**: `ts-fsrs` на npm (ESM/CJS/UMD, Node 18+). Нюанс: FSRS работает с 4 рейтингами (Again/Hard/Good/Easy), а quiz-bot даёт бинарный результат (правильно/неправильно) — нужна адаптация.

### HLR — Half-Life Regression (Duolingo)

Settles & Meeder, ACL 2016. Production-алгоритм Duolingo.

```
p = 2^(-Δt / h)
h = 2^(θ · x)
```

где `p` — вероятность вспомнить, `Δt` — время с последней практики, `h` — период полураспада, `x` — вектор признаков (history_seen, history_correct, delta, lexeme features).

Loss function:
```
L = (p - p̂)² + (h - ĥ)² + λ·||θ||²
```

Расширение C-HLR+ добавляет сложность слова для наклона кривой забывания:
```
p = 2^(-(t/h)^C), где C = mean word complexity
```

**Результаты**: 45%+ снижение ошибки по сравнению с Leitner/Pimsleur. Датасет: 13 млн learning traces.

**Для quiz-bot**: идеально подходит концептуально (создан для language learning, работает с binary outcomes). Формулы простые — можно реализовать в ~50 строк TypeScript. Проигрывает FSRS на бенчмарках, но FSRS не оптимизирован для языкового обучения.

### Leitner System

Коробочная система: 5 коробок с фиксированными интервалами (1, 2, 4, 7, 14 дней). Правильно → вверх, неправильно → в коробку 1.

**Для quiz-bot**: слишком грубо. Не адаптируется к пользователю или сложности элемента.

---

## Duolingo Birdbrain — production-система

Birdbrain — production ML-система Duolingo для адаптивного обучения.

### Архитектура

1. **Knowledge Tracing слой**: трекает индивидуальные **лексемы** (формы слов с морфологическими тегами). Пример: `camera.N.SG` — слово camera, существительное, единственное число. У каждого лексема своя кривая забывания.

2. **HLR**: предсказывает вероятность вспоминания для каждого лексема.

3. **Exercise generation**: подбирает упражнения на границе знаний (desirable difficulty).

### Структура знаний Duolingo

```
Units (коммуникативные цели: "заказать в ресторане")
  └── Skills (грамматика/тема: "present tense", "food vocabulary")
       └── Lessons (4-6 новых лексем за урок)
            └── Lexemes (отдельные формы слов с морф. тегами)
```

### Ключевые инсайты

- Лёгкие слова: когнаты, короткие, частотные, регулярные
- Трудные слова: редкие, нерегулярные, сложная грамматика
- Что знает пользователь и насколько сложен материал — определяются совместно
- Индивидуальные кривые обучения следуют **mixture model** (Streeter, EDM 2015)

---

## Модели Knowledge Components

### Q-Matrix

Фундаментальное представление: строки = вопросы, столбцы = KC. Ячейка = 1, если вопрос тестирует данный KC.

### Подходы к структурированию KC (от простого к сложному)

1. **Непересекающиеся KC**: один вопрос → один KC. Самый простой.
2. **Множественные KC на вопрос**: один вопрос тестирует несколько навыков (грамматика + лексика).
3. **Иерархия KC**: дерево (English > Grammar > Tenses > Present Perfect).
4. **Граф пререквизитов**: направленный граф, где для одного навыка нужен другой.

### Автоматическое обнаружение KC

- SPARFA: через sparse factor analysis (офлайн)
- LLM-based (2024): LLM извлекает KC из описаний упражнений
- Attentive Q-Matrix Learning: нейросетевое внимание для обучения маппинга вопрос→KC

### Рекомендация для quiz-bot

Начать с простого: каждый вопрос → 1-3 тега (topics). Иерархия через naming convention:
```
"grammar/articles"
"grammar/present_perfect"
"vocab/food"
"vocab/phrasal_verbs/get"
```

Не строить prerequisite graph — преждевременная оптимизация.

---

## Cold Start

### Ключевая находка

Springer, 2024: **"Knowing What > Knowing Who"** — знание сложности вопросов (из агрегированных данных) важнее, чем характеристики нового пользователя.

### Стратегии

1. **Population-level priors (рекомендуется)**
   - Начальный уровень = среднее по всем пользователям
   - Сложность вопросов = aggregate correct rate
   - Elo достигает корреляции **0.702** с реальным уровнем после **5 вопросов**

2. **Динамический K-фактор (рекомендуется)**
   ```
   K = K_base / (1 + c · n)
   ```
   Большой K вначале → быстрая адаптация, убывает с опытом.

3. **Adaptive placement test**
   - 5-10 вопросов с бинарным поиском уровня
   - Можно встроить в `/start` как «давай определим твой уровень»

4. **Clustering**
   - Начальные параметры из похожих пользователей (родной язык, заявленный уровень)
   - Duolingo: испаноговорящие, изучающие итальянский, стартуют с повышенным vocab score

5. **Pre-estimation difficulty**
   - Прекалибровка сложности вопросов при seed
   - «Тёплый старт» вместо холодного

---

## Готовые реализации и библиотеки

### Spaced Repetition

| Библиотека | Язык | Алгоритм | Заметки |
|------------|------|----------|---------|
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | **TypeScript** | FSRS-6/7 | **Лучший fit для нашего стека.** ESM/CJS. `npm install ts-fsrs`. Node 18+. |
| [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs) | Python | FSRS | С оптимизатором |
| [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) | Rust | FSRS | С биндингами для Node/Python |
| [fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) | Python | FSRS | Обучение кастомных параметров по логам |

### Knowledge Tracing

| Библиотека | Язык | Алгоритм | Заметки |
|------------|------|----------|---------|
| [pyBKT](https://github.com/CAHLR/pyBKT) | Python/C++ | BKT + варианты | Scikit-learn API. Для исследования, не production. |
| [halflife-regression](https://github.com/duolingo/halflife-regression) | Python | HLR | Референсная реализация Duolingo. Датасет на Harvard Dataverse. |

### Ключевое ограничение

Convex — серверлесс JS-рантайм. Нет Python, нет GPU, нет тяжёлого ML. Пригодны только **чистые TypeScript/JS решения** или собственные реализации простых формул.

---

## Рекомендуемая архитектура для quiz-bot

### Трёхуровневая гибридная модель: Elo + HLR + topic tagging

```
┌─────────────────────────────────────────────────────┐
│  Уровень 1: Multi-Dim Elo (уже реализован)         │
│  5 skill dimensions — общая картина уровня          │
│  Использование: отчёт пользователю, общий подбор    │
├─────────────────────────────────────────────────────┤
│  Уровень 2: Per-Topic KC Tracking (новое)           │
│  Таблица topicMastery: userId × topicId             │
│  Модель забывания: HLR-inspired (p = 2^(-Δt/h))    │
│  halfLife растёт с правильными ответами             │
├─────────────────────────────────────────────────────┤
│  Уровень 3: Adaptive Question Selection (новое)     │
│  priority = f(theta, retention, Δt)                  │
│  Стратегия: 60% слабые темы + 30% повторение +      │
│             10% новые темы                           │
└─────────────────────────────────────────────────────┘
```

### Конкретные формулы

**Per-topic Elo с динамическим K:**
```ts
const K = K_BASE / (1 + 0.1 * seenCount);  // большой K вначале
const expected = 1 / (1 + Math.pow(10, (difficulty - theta) / 400));
const newTheta = theta + K * (correct ? 1 : 0 - expected);
```

**Модель забывания (HLR-inspired):**
```ts
const daysSinceLastSeen = (now - lastSeen) / MS_PER_DAY;
const retention = Math.pow(2, -daysSinceLastSeen / halfLife);

if (correct) {
  halfLife = halfLife * 2.0;    // удвоение при успехе
} else {
  halfLife = Math.max(0.5, halfLife * 0.5);  // сброс при ошибке
}
```

**Приоритет вопроса:**
```ts
const needScore = 1 - theta / MAX_THETA;    // чем слабее тема — тем нужнее
const urgency = 1 - retention;               // чем ниже retention — тем срочнее
const priority = 0.6 * needScore + 0.4 * urgency;
```

### Схема данных

**Новая таблица `topicMastery`:**
```ts
topicMastery: defineTable({
  userId: v.id("users"),
  topicId: v.string(),       // "grammar/present_perfect", "vocab/food"
  theta: v.float64(),         // текущий уровень по теме
  halfLife: v.float64(),      // период полураспада (дни)
  lastSeen: v.float64(),      // timestamp последней практики
  seenCount: v.int64(),       // сколько раз встречал
  correctCount: v.int64(),    // сколько раз ответил правильно
})
  .index("by_user", ["userId"])
  .index("by_user_topic", ["userId", "topicId"])
```

**Расширение таблицы `questions`:**
```ts
topics: v.array(v.string()),  // ["grammar/articles", "vocab/food"]
```

Каждый вопрос → 1-3 темы. При ответе обновляются все затронутые KC.

### Что НЕ делать

1. **Нейросетевые гейты** — overengineering, нет данных для обучения
2. **10K+ компонентов** на старте — начать с 20-50 тем
3. **Prerequisite graph** — преждевременная оптимизация
4. **DKT/LSTM** — несовместим с серверлесс Convex
5. **Нейронный инференс на каждый запрос** — latency + cost

---

## Открытые вопросы для дальнейшего исследования

### Высокий приоритет

1. **Адаптация FSRS для бинарных ответов**: FSRS рассчитан на 4 рейтинга (Again/Hard/Good/Easy). Как маппить бинарный правильно/неправильно? Варианты: правильно → Good, неправильно → Again. Или маппить по скорости ответа / числу попыток. Нужно изучить `ts-fsrs` API и решить.

2. **Таксономия тем для English learning**: какие конкретно topicId использовать? Нужно составить начальный каталог из 20-50 тем, покрывающих A1-B2 уровни. Связать с CEFR. Возможно использовать English Profile / English Vocabulary Profile как источник.

3. **ts-fsrs совместимость с Convex runtime**: проверить, что `ts-fsrs` работает в Convex action runtime (ограничения на Node APIs, bundling). Если нет — реализовать core FSRS формулы вручную (~100 строк).

### Средний приоритет

4. **Оптимальное соотношение стратегий выбора вопросов**: 60/30/10 (слабые/повторение/новые) — гипотеза. Нужно A/B тестирование или поиск литературы по оптимальным пропорциям.

5. **Начальные значения halfLife и theta**: какие дефолты для нового KC? halfLife = 1 день? theta = 1000 (средний Elo)? Нужно калибровать.

6. **Забывание на уровне skill dimensions**: сейчас Elo-рейтинги по 5 dimensions не учитывают забывание. Нужно ли добавить decay на уровне 1? Или достаточно per-topic decay на уровне 2?

### Низкий приоритет

7. **FSRS parameter optimization**: когда накопится достаточно данных (1K+ ответов), запустить `fsrs-optimizer` для обучения кастомных параметров на наших данных.

8. **Кросс-KC зависимости**: моделирование того, как знание одной темы влияет на другую (артикли → существительные). Не нужно на старте, но может дать выигрыш при масштабировании.

9. **Визуализация прогресса для пользователя**: как показать детальный прогресс в Telegram? Inline-кнопки, мини-apps, или текстовые отчёты?

---

## Источники

### Ключевые papers

- Settles & Meeder, "A Trainable Spaced Repetition Model for Language Learning", ACL 2016 — [PDF](https://research.duolingo.com/papers/settles.acl16.pdf)
- Corbett & Anderson, "Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge", User Modeling and User-Adapted Interaction, 1995
- Piech et al., "Deep Knowledge Tracing", NeurIPS 2015
- Lan et al., "Sparse Factor Analysis for Learning and Content Analytics", JMLR 2014 — [PDF](https://jmlr.org/papers/volume15/lan14a/lan14a.pdf)
- Pelánek, "Applications of the Elo Rating System in Adaptive Educational Systems", 2016
- Streeter, "Mixture Modeling of Individual Learning Curves", EDM 2015 — [PDF](https://research.duolingo.com/papers/streeter.edm15.pdf)
- "Knowing What Matters More Than Knowing Who", Springer 2024

### Бенчмарки и данные

- [SRS Benchmark](https://github.com/open-spaced-repetition/srs-benchmark) — 1.7B ревью, сравнение FSRS/SM-2/HLR/Ebisu
- [FSRS Algorithm Technical Explanation](https://expertium.github.io/Algorithm.html)
- [Implementing FSRS in 100 Lines](https://borretti.me/article/implementing-fsrs-in-100-lines)
- [FSRS ABC Wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)

### Реализации

- [ts-fsrs (npm)](https://www.npmjs.com/package/ts-fsrs) — TypeScript, совместим с нашим стеком
- [Duolingo HLR (GitHub)](https://github.com/duolingo/halflife-regression) — референсная Python-реализация
- [pyBKT (GitHub)](https://github.com/CAHLR/pyBKT) — Bayesian Knowledge Tracing
- [open-spaced-repetition org](https://github.com/open-spaced-repetition) — экосистема FSRS

### Duolingo

- [Birdbrain Blog Post](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain/)
- [HLR Analysis by Papousek](https://papousek.github.io/analysis-of-half-life-regression-model-made-by-duolingo.html)

### Другое

- [Knowledge Tracing Survey, ACM Computing Surveys](https://dl.acm.org/doi/10.1145/3569576)
- [DKT Critique](https://s2.smu.edu/~eclarson/pubs/2019DeepKnowledge.pdf)
- [Cold Start Study, 2025](https://arxiv.org/abs/2505.21517)
- [Adaptive Forgetting Curves (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7334729/)
- [Q-Matrix Learning Theories](https://www.learning-theories.org/doku.php?id=knowledge_assessment:q-matrix)
