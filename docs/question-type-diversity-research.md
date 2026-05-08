# Разнообразие типов вопросов в адаптивных обучающих системах

## Контекст

Исследование проведено для Telegram квиз-бота по изучению английского языка. Текущее состояние: 2 типа взаимодействия (`single` — выбор одного ответа, `yes_no`). Планируется расширение. Цель — обосновать стратегию расширения типов вопросов на основе научных данных.

---

## 1. Монотипная vs полиморфная система

### 1.1. Влияние на эффективность обучения (retention, recall, transfer)

**Ключевой вывод**: смешивание типов вопросов улучшает долгосрочное запоминание, но замедляет краткосрочный прогресс.

Лаборатория Bjork (UCLA) установила, что условия обучения, которые замедляют видимый прогресс, оптимизируют долгосрочное запоминание и перенос знаний (transfer). Это явление получило название **desirable difficulties** — «желательные трудности» [1]. Конкретно:

- **Interleaving effect**: при чередовании разных типов задач (в отличие от блочного изучения одного типа) результаты на отложенном тесте через неделю составили **63% правильных ответов** vs **20%** при блочном подходе [1].
- **Subadditive effects**: интересно, что spacing и interleaving вместе не дают аддитивного эффекта — их механизмы частично перекрываются [1].
- **Смешение форматов тестирования**: мета-анализ показал, что комбинация разных типов тестов (multiple choice + short answer + free recall) даёт **наиболее сильный retrieval practice effect** [2].

Количественно, разные форматы имеют разную силу эффекта (Hedges' g):
- Free recall: **g = 0.81**
- Cued recall (fill-in-the-blank): **g = 0.72**
- Recognition (multiple choice): **g = 0.36** [2]

Однако при успешном извлечении (retrieval) разница между MCQ и VSAQ (very short answer questions) **не значима** — оба формата эффективны [3].

**Вывод для бота**: система с 1 типом вопроса (только MCQ) использует самый слабый формат retrieval practice (g=0.36). Добавление даже одного формата с генерацией ответа (cloze, free text) может удвоить эффективность обучения.

### 1.2. Влияние на эффективность тестирования (measurement accuracy, construct validity)

В рамках IRT (Item Response Theory), использование **разных форматов вопросов** создаёт проблему калибровки: разные типы айтемов могут измерять разные конструкты, и для смешанных форматов обычно нужны отдельные IRT-модели [4]. Однако это же свойство делает измерение **более полным** — single-choice измеряет узнавание (recognition), а constructed response — реальное воспроизведение (recall).

Исследования показывают, что:
- MCQ имеют **лучшую criterion validity** (предсказание внешних показателей)
- Free response имеют **лучшую internal consistency** и EAP reliability [5]
- Для полного измерения языковых навыков нужны оба формата

**Вывод для бота**: для IRT-модели нужно калибровать параметры отдельно по типам вопросов. Параметр `guessing` (c) существенно различается: у MCQ с 4 вариантами c ≈ 0.25, у open-ended c ≈ 0.

### 1.3. Удержание внимания и мотивации (engagement, flow state)

Duolingo использует **10+ типов упражнений** и атрибутирует высокую вовлечённость (daily active users, streak retention) именно разнообразию: переключение между форматами заставляет мозг менять контекст, что уменьшает скуку и улучшает retention [6].

Исследования показывают:
- Gamification (включая разнообразие задач) **снижает субъективную когнитивную нагрузку** при обучении [7]
- Cognitive load оказывает **более сильное влияние** на engagement, чем мотивация сама по себе [7]
- Однако плохо настроенная частота смены типов вызывает **user fatigue** и обратный эффект [8]

**Вывод для бота**: разнообразие необходимо для удержания, но нужен баланс — слишком частая смена типов увеличивает extraneous cognitive load.

### 1.4. Онбординг (cognitive load для новых пользователей)

Принцип **progressive disclosure** из UX-исследований напрямую применим:
- Показывать сначала простейший формат (MCQ — самый интуитивный)
- Вводить новые типы **постепенно**, по мере освоения предыдущих
- Оптимальное количество вариантов при первом контакте: **2–3 вопроса** [9]

Slack, Canva и другие продукты используют этот подход: сначала скрывают все фичи, кроме базовых, и вводят новые по мере того, как пользователь осваивает текущие [9].

**Вывод для бота**: первые 5–10 вопросов для нового пользователя — только single-choice. Новые типы вводить после N успешных ответов или по достижении определённого скилла.

### 1.5. Усталость от однообразия (fatigue, habituation)

**Habituation** — снижение реакции на повторяющийся стимул — фундаментальный нейрокогнитивный механизм [10]. В контексте квиз-бота это проявляется как:
- Автоматическое «кликание» по ответам без вдумчивого анализа
- Снижение engagement при монотонной последовательности одинаковых MCQ
- Отличие от fatigue: habituation специфична к стимулу, fatigue — общее утомление

Способ борьбы с habituation — **dishabituation** через изменение стимула. В нашем случае это именно смена типа вопроса: после серии MCQ один cloze-вопрос «перезагружает» внимание [10].

**Вывод для бота**: даже 2–3 типа вопросов достаточно для базовой dishabituation. Не нужно 10 типов — достаточно периодически ломать паттерн.

---

## 2. Таксономия типов вопросов для language learning

### Соотношение с таксономией Блума (Revised, 2001)

| Уровень Блума | Когнитивный процесс | Подходящие типы вопросов | Примеры для English learning |
|---|---|---|---|
| **Remember** | Извлечение знания из памяти | MCQ, True/False, Matching | «Какова форма Past Simple глагола go?» |
| **Understand** | Определение значения | MCQ, Cloze, Translation | «Что означает фразовый глагол give up?» |
| **Apply** | Использование в новой ситуации | Cloze, Fill-in-the-blank, Ordering | «She ___ to work every day» (заполнить пропуск) |
| **Analyze** | Разложение на компоненты | Error correction, Matching | «Найдите ошибку: He don't like coffee» |
| **Evaluate** | Суждение на основе критериев | Error correction, Free text | «Какое предложение звучит естественнее?» |
| **Create** | Генерация нового | Free text, Translation | «Переведите предложение на английский» |

Исследование языковых тестов показало, что большинство вопросов в стандартных assessment системах покрывают **только уровни Remember и Understand** [11]. Добавление cloze, error correction и free text позволяет подняться до Apply–Analyze.

### Детальный обзор типов вопросов

#### 2.1. Multiple Choice (single answer) — текущий тип `single`
- **Уровень Блума**: Remember, Understand
- **Cognitive mechanism**: Recognition (узнавание), а не recall (воспроизведение)
- **Эффективность**: g = 0.36 (retrieval practice), но хорошо калиброванные дистракторы повышают эффективность до уровня free recall [1]
- **IRT**: guessing parameter c ≈ 1/n (n — количество вариантов)
- **Telegram**: идеально реализуется через inline keyboard

#### 2.2. True/False (Yes/No) — текущий тип `yes_no`
- **Уровень Блума**: Remember
- **Cognitive mechanism**: Recognition (бинарное решение)
- **Эффективность**: самый слабый формат — guessing = 0.5, низкая discriminability
- **Ценность**: быстрые вопросы, снижение cognitive load, хорош для скринига базовых знаний
- **Telegram**: 2 кнопки inline keyboard

#### 2.3. Fill-in-the-blank / Cloze
- **Уровень Блума**: Apply
- **Cognitive mechanism**: Cued recall (подсказанное воспроизведение)
- **Эффективность**: g = 0.72 — почти вдвое сильнее MCQ [2]. Высокая корреляция с тестами грамматики (r=0.70), словарного запаса (r=0.60) и reading comprehension (r=0.68) [12]
- **Generation effect**: активная генерация ответа улучшает запоминание на **20–40%** по сравнению с пассивным выбором [13]
- **IRT**: guessing ≈ 0, высокая discrimination
- **Telegram**: два варианта реализации:
  - **С вариантами ответа** (inline keyboard) — промежуточный формат между MCQ и open-ended
  - **Free input** (ForceReply + text message handler) — полноценный cued recall
- **Приоритет**: **ВЫСОКИЙ** — максимальный ROI добавления

#### 2.4. Matching (соединить пары)
- **Уровень Блума**: Remember, Understand
- **Cognitive mechanism**: Paired-associate learning
- **Эффективность**: хорош для grammar learning, особенно pattern recognition. Keyword method применим для запоминания неправильных форм [14]
- **Telegram**: **сложно реализовать** классический drag-and-drop. Возможные подходы:
  - Последовательный выбор пар через inline keyboard (2 шага на пару)
  - Серия отдельных MCQ «подберите перевод для X»
  - Web App (mini app) для полноценного drag-and-drop
- **Приоритет**: НИЗКИЙ (из-за сложности UX в Telegram)

#### 2.5. Ordering / Sequencing (расставить в правильном порядке)
- **Уровень Блума**: Apply, Analyze
- **Cognitive mechanism**: Syntactic processing, structure awareness
- **Эффективность**: развивает понимание структуры предложения, порядка слов — ключевой навык для L2 learners [15]
- **Telegram**: возможные реализации:
  - Последовательный выбор слов через inline keyboard (по одному слову за клик)
  - Нумерованные кнопки для выбора позиции
- **Приоритет**: СРЕДНИЙ — полезен, реализация в Telegram трудоёмкая но возможная

#### 2.6. Free text input (ввод ответа)
- **Уровень Блума**: Apply, Create
- **Cognitive mechanism**: Free recall / production
- **Эффективность**: g = 0.81 — самый сильный retrieval practice effect [2]. Production effect: набор текста значительно улучшает запоминание по сравнению с выбором [13]
- **Telegram**: реализуется через ForceReply (input field placeholder 1–64 символа) + text message handler. Сложности:
  - Нужен fuzzy matching (опечатки, регистр, пунктуация)
  - Потенциальные конфликты с другими text handlers
  - Нет визуальной подсказки, что ожидается текстовый ввод (только placeholder)
- **Приоритет**: СРЕДНИЙ-ВЫСОКИЙ — очень эффективен, но сложен в реализации

#### 2.7. Audio/Listening comprehension
- **Уровень Блума**: Understand
- **Cognitive mechanism**: Auditory processing, phonemic awareness
- **Эффективность**: Duolingo активно использует listening exercises. Критичен для реального владения языком
- **Telegram**: поддерживается через sendAudio/sendVoice. В схеме уже заложено поле `audioStorageId`
- **Приоритет**: СРЕДНИЙ — инфраструктура готова (поле в схеме есть), нужен контент

#### 2.8. Image-based questions
- **Уровень Блума**: Remember, Understand
- **Cognitive mechanism**: Dual coding (визуальный + вербальный каналы)
- **Эффективность**: dual coding theory — два канала кодирования усиливают запоминание
- **Telegram**: **уже реализовано** — `imageStorageId`, `telegramFileId` cache, sendPhoto
- **Приоритет**: уже есть, расширять контент

#### 2.9. Error Correction / Find the mistake
- **Уровень Блума**: Analyze, Evaluate
- **Cognitive mechanism**: Critical analysis, pattern recognition
- **Эффективность**: развивает метакогнитивные навыки, улучшает accuracy. Особенно эффективен для грамматики — заставляет не просто знать правило, а **применять его к чужому тексту** [16]
- **Telegram**: отлично реализуется как MCQ-вариант:
  - Показать предложение с ошибкой, предложить варианты исправлений
  - Или: показать 3–4 предложения, спросить «в каком ошибка?»
- **Приоритет**: **ВЫСОКИЙ** — легко реализовать (это по сути MCQ с другой формулировкой), высокая когнитивная ценность

#### 2.10. Translation tasks
- **Уровень Блума**: Apply, Create
- **Cognitive mechanism**: Cross-linguistic transfer, production
- **Эффективность**: один из основных форматов Duolingo. Задействует production (generation effect), что значительно сильнее recognition [13]
- **Telegram**: два варианта:
  - MCQ с вариантами переводов (recognition) — проще
  - Free text input (production) — эффективнее, но сложнее в оценке
- **Приоритет**: СРЕДНИЙ — по сути это подтип cloze или free text

---

## 3. Desirable Difficulty и Interleaving Effect

### 3.1. Центральный парадокс

Bjork Lab сформулировал фундаментальный принцип: **условия, ускоряющие видимый прогресс, часто ухудшают долгосрочное запоминание** [1]. И наоборот — трудности во время обучения (desirable difficulties) оптимизируют retention и transfer.

Применительно к типам вопросов это означает:
- Монотонные MCQ создают **иллюзию знания** (высокий процент правильных ответов из-за recognition + guessing)
- Переключение на cloze или free text **роняет accuracy**, но усиливает реальное запоминание
- Пользователь может воспринять это как «ухудшение» — нужна коммуникация

### 3.2. Interleaving vs Blocking

| Аспект | Blocking (один тип подряд) | Interleaving (чередование типов) |
|---|---|---|
| Immediate performance | Выше | Ниже |
| Delayed retention (1 week) | **20%** | **63%** |
| Subjective ease | «Легко, понимаю» | «Сложно, путаюсь» |
| Actual learning | Слабое | Сильное |

Данные из исследования Bjork Lab: interleaving instruction для формул объёма 3D-фигур [1].

### 3.3. Contextual Interference

Мета-анализы эффекта contextual interference (аналога interleaving для моторных навыков) показывают:
- **Высокий CI улучшает retention** в лабораторных условиях [17]
- Но **генерализация на реальные задачи ограничена** [17]
- Для cognitive skills (включая language learning) эффект более стабилен, чем для моторных навыков

### 3.4. Практические implications для interleaving типов вопросов

1. **Не группировать вопросы одного типа**: после 2–3 MCQ подряд вставлять другой тип
2. **Не менять тип каждый вопрос**: это создаёт слишком высокий cognitive load
3. **Оптимальный паттерн**: мини-блоки по 2–3 вопроса одного типа, затем переключение
4. **Feedback на «трудные» типы**: объяснять, что сложность — это нормально и полезно

---

## 4. Практические рекомендации для квиз-бота

### 4.1. Оптимальное количество типов вопросов

На основе исследований:
- **Минимум для эффективности**: 3 типа (MCQ + один recall-based + один analysis-based)
- **Оптимум**: 4–5 типов (достаточно для desirable difficulty, interleaving, и dishabituation без перегрузки)
- **Максимум без усложнения**: 6–7 типов (после этого maintenance cost растёт быстрее, чем educational value)

Duolingo использует 10+ типов, но это продукт с командой в сотни инженеров. Для квиз-бота **4–5 типов** — золотая середина.

### 4.2. Приоритизация добавления новых типов

#### Волна 1 (максимальный ROI, минимальная сложность):

**1. Error Correction** — «Найди ошибку»
- Реализация: **нулевая стоимость** — это тот же MCQ с другой формулировкой prompt
- Не требует нового `choiceType` — можно использовать `single` с семантически другим prompt
- Покрывает уровень Analyze (vs только Remember/Understand у MCQ)
- Пример: `"Какое предложение содержит ошибку?"` + варианты

**2. Cloze с вариантами ответа** — «Заполни пропуск» (MCQ-стиль)
- Реализация: **нулевая стоимость** — тоже по сути `single` с другой формулировкой
- Уже частично используется (вопрос «She ___ to work every day» — это и есть cloze)
- Формализация как отдельного типа улучшит аналитику и IRT-калибровку

> Волна 1 не требует изменений в коде бота или схеме — только в контенте.

#### Волна 2 (средний ROI, средняя сложность):

**3. Free text input** — «Введи ответ»
- Реализация: ForceReply + text message handler + fuzzy matching
- Переход от recognition (g=0.36) к production (g=0.81) — двукратное усиление
- Требует: нового `choiceType`, handler для текстовых ответов, логики валидации
- Подвариант: «Напиши форму Past Simple глагола go» → ожидаемый ответ «went»

**4. Ordering** — «Расставь слова в правильном порядке»
- Реализация: серия inline keyboard кнопок, выбор слов по одному
- Хорош для грамматики порядка слов (word order — частая проблема L2)
- Требует: нового `choiceType`, другой структуры данных, нового UI-flow

#### Волна 3 (специализированные типы):

**5. Audio questions** — «Прослушай и ответь»
- Инфраструктура уже заложена (`audioStorageId` в схеме)
- Нужен: аудио-контент (TTS или записи), handler для аудио-вопросов
- Покрывает навык listening (один из 5 в skillVector)

**6. Matching** — «Соедини пары»
- Наиболее сложный в реализации для Telegram
- Возможно, лучше через Telegram Web App (mini app)
- Или деградированный вариант: серия отдельных MCQ

### 4.3. Стратегия онбординга новых типов

На основе принципов progressive disclosure [9]:

```
Новый пользователь:
  Вопросы 1–10:  только MCQ (single)
  Вопросы 11–20: MCQ + yes_no (мягкое введение второго типа)
  Вопросы 21–30: MCQ + yes_no + error_correction
  Вопрос 31+:    полная ротация доступных типов

При введении нового типа:
  1. Показать краткую инструкцию (1 строка в prompt)
  2. Первый вопрос нового типа — лёгкий (difficulty < -1.0)
  3. Не вводить два новых типа подряд
```

### 4.4. Баланс между разнообразием и сложностью реализации

| Тип | Эффективность обучения | Сложность реализации | ROI |
|---|---|---|---|
| Error correction (MCQ-based) | Высокая (Analyze) | Нулевая (контент) | **Максимальный** |
| Cloze с вариантами | Высокая (Apply) | Нулевая (контент) | **Максимальный** |
| Free text input | Очень высокая (Produce) | Средняя (handler + matching) | Высокий |
| Ordering | Высокая (Apply) | Высокая (новый UI flow) | Средний |
| Audio questions | Средняя (Listening) | Средняя (контент + handler) | Средний |
| Matching | Средняя (Remember) | Очень высокая (UX) | Низкий |

---

## 5. Ограничения Telegram

### 5.1. Что Telegram поддерживает

| Механизм | Возможности | Ограничения |
|---|---|---|
| **Inline Keyboard** | До 8 кнопок в ряд, до 100 кнопок всего | callback_data: 1–64 байт UTF-8 |
| **ForceReply** | Открывает поле ввода с placeholder (1–64 символа) | Не работает в каналах |
| **sendPoll (quiz mode)** | Нативный квиз с correct_option_id | Explanation до 200 символов, 2–10 вариантов |
| **sendPhoto** | PNG/JPEG с caption | Caption до 1024 символов |
| **sendAudio/sendVoice** | MP3, OGG | Нет inline playback в некоторых клиентах |
| **editMessageText/Caption** | Редактирование после ответа | Нельзя менять тип сообщения (text↔photo) |

### 5.2. Реализуемость типов вопросов

| Тип вопроса | Реализация в Telegram | Качество UX |
|---|---|---|
| MCQ (single) | Inline keyboard | Отличное |
| Yes/No | Inline keyboard (2 кнопки) | Отличное |
| Error correction | Inline keyboard (= MCQ) | Отличное |
| Cloze с вариантами | Inline keyboard (= MCQ) | Отличное |
| Free text input | ForceReply + text handler | Хорошее (нужен placeholder) |
| Ordering | Серия кнопок + state tracking | Среднее (многошаговый) |
| Audio + MCQ | sendAudio + inline keyboard | Хорошее |
| Matching | Серия inline keyboards | Плохое (workaround) |
| Matching (Web App) | Telegram Mini App | Хорошее (но отдельная разработка) |

### 5.3. Специфические ограничения для квиз-бота

1. **callback_data 64 bytes**: формат `qa:<id>:<index>` уже близок к лимиту. Для новых типов нужен ещё более компактный формат
2. **Нет drag-and-drop**: matching и ordering требуют workaround через последовательные клики
3. **Один message per response**: нельзя атомарно отправить «аудио + клавиатура» — нужно 2 сообщения (или аудио + inline keyboard в caption)
4. **ForceReply не гарантирует текстовый ответ**: пользователь может отправить стикер, фото или голосовое — нужна валидация
5. **editMessageCaption limit**: 1024 символа — для длинных объяснений нужен fallback на отдельное сообщение (уже реализовано)

---

## 6. Рекомендуемая стратегия

### Немедленно (без изменений в коде):
1. Добавить в seed-данные вопросы формата **error correction** и **cloze** — они используют тот же `choiceType: "single"`, но с другой семантикой prompt
2. Ввести поле-тег (или конвенцию в prompt) для аналитики по «подтипам» MCQ

### Ближайшая итерация:
3. Реализовать **free text input** через ForceReply — это даст максимальный скачок в эффективности обучения (recognition → production)
4. Добавить `choiceType: "text_input"` в схему с expected answer + acceptable variants

### Среднесрочно:
5. **Ordering** через серию inline keyboard кликов
6. **Audio questions** с использованием уже заложенного `audioStorageId`

### Долгосрочно:
7. **Matching** через Telegram Mini App (если DAU оправдывает инвестицию)

---

## Источники

1. [Bjork Learning and Forgetting Lab — Research](https://bjorklab.psych.ucla.edu/research/) — desirable difficulties, interleaving, spacing, testing effects
2. [Frontiers — Retrieval Practice in Classroom Settings](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2019.00005/full) — мета-анализ retrieval practice, эффекты разных форматов (free recall g=0.81, cued recall g=0.72, recognition g=0.36)
3. [PMC — The battle of question formats: VSAQ vs MCQ](https://pmc.ncbi.nlm.nih.gov/articles/PMC11684041/) — сравнение MCQ и VSAQ для retrieval practice
4. [Wikipedia — Item Response Theory](https://en.wikipedia.org/wiki/Item_response_theory) — IRT для mixed-format assessments
5. [Frontiers — Effects of Response Format on Psychometric Properties](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2020.00015/full) — MCQ vs free response, validity и reliability
6. [Duolingo Research](https://research.duolingo.com/) — адаптивное обучение, interleaving типов упражнений
7. [MDPI — Gamification's Influence on Motivation and Cognitive Load](https://www.mdpi.com/2227-7102/14/10/1115) — cognitive load и gamification
8. [PMC — Psychology of EdTech Nudging](https://pmc.ncbi.nlm.nih.gov/articles/PMC12468426/) — user fatigue от неправильно настроенной частоты
9. [Medium — Progressive Onboarding](https://medium.com/@blessingokpala/progressive-onboarding-learning-the-app-as-you-use-itprogressive-onboarding-learning-the-app-as-1ba3c8a65e81) — progressive disclosure для сложных продуктов
10. [Wikipedia — Habituation](https://en.wikipedia.org/wiki/Habituation) — habituation как нейрокогнитивный механизм
11. [ResearchGate — Language assessment through Bloom's Taxonomy](https://www.researchgate.net/publication/328416109_Language_assessment_through_Bloom's_Taxonomy) — уровни Блума в языковых тестах
12. [Cloze test — Wikipedia](https://en.wikipedia.org/wiki/Cloze_test) + [Meta-analysis of second language cloze](https://www.hawaii.edu/sls/wp-content/uploads/2014/09/Watanabe_Koyama.pdf) — cloze test effectiveness, корреляции с языковыми навыками
13. [Wikipedia — Generation effect](https://en.wikipedia.org/wiki/Generation_effect) + [Structural Learning — Generation Effect](https://www.structural-learning.com/post/generation-effect-active-learning) — production vs recognition, 20–40% improvement
14. [Atlantis Press — Make a Match Technique in Teaching Vocabulary](https://www.atlantis-press.com/article/55909175.pdf) — paired-associate learning для grammar forms
15. [ERIC — Sentence Reordering in Language Learning](https://files.eric.ed.gov/fulltext/EJ1149764.pdf) — syntactic processing, word order awareness
16. [Cambridge English — The role of error](https://www.cambridgeenglish.org/images/168887-tkt-module-1-the-role-of-error-.pdf) — error correction strategies, metacognitive benefits
17. [PMC — High contextual interference improves retention](https://pmc.ncbi.nlm.nih.gov/articles/PMC11237090/) — мета-анализ contextual interference effect
18. [Duolingo Wiki — Exercise Types](https://duolingo.fandom.com/wiki/Exercise) — полный список типов упражнений Duolingo
19. [Telegram Bot API](https://core.telegram.org/bots/api) — ограничения inline keyboard, ForceReply, polls
20. [Bjork & Bjork (2011) — Making things hard on yourself](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf) — desirable difficulties framework
21. [PMC — Personalized adaptive learning: impact on performance and engagement](https://pmc.ncbi.nlm.nih.gov/articles/PMC11544060/) — адаптивное обучение в высшем образовании
22. [Springer — It matters how to recall: task differences in retrieval practice](https://link.springer.com/article/10.1007/s11251-020-09526-1) — short-answer vs free recall: разные когнитивные бенефиты
