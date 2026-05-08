# Рецензия: grammar/past_time/be_was_were

**Дата:** 2026-05-08T12:03:54.019304
**Входных вопросов:** 81
**Отобрано:** 18
**Отклонено:** 63

## Покрытие KC

Отобранные вопросы покрывают следующие аспекты Past Simple be (was/were) на уровне A1:

- **Единственное число (was):** I (idx=38), he/she/it в лице Nastya (idx=29), it — погода (idx=3), it — пляж/фильм (idx=14, 16), this (idx=35)
- **Множественное число (were):** you (idx=10, 40), we (idx=1, 20, 78), they — tickets/characters/gardens/movies (idx=19, 48, 49, 71)
- **Вопросительная форма:** Where was/were (idx=14, 20), Were you...? (idx=1)
- **Отрицательная форма:** wasn't (idx=7, 31), weren't (idx=26, 40)
- **Краткие ответы:** Yes, she was (idx=29), Yes, we were (idx=1), No, it wasn't (idx=31)
- **Разнообразие контекстов:** путешествия (Париж, Бали, Порту), офис, детские сценарии (мячи, сестра Алиса), popculture (Marvel, Ryan Gosling), литература (Кенджи), истории (Киото 1970-х)

**Чего не хватает:**
- Больше практики с краткими ответами для he/she/it в отрицании (No, he wasn't)
- Вопросы с подлежащим you во множественном значении (вы/вы все)

## Отклонённые

### Сложность выше A1 (44)
- **[office]** minimaxai/minimax-m2.5: Краткий ответ с I: Was I right? — Past Simple be — сложность выше A1
- **[traveler]** minimaxai/minimax-m2.5: Отрицание про третье лицо: she + wasn’t/weren’t в контексте хостела — сложность выше A1
- **[provocateur]** minimaxai/minimax-m2.5: Выбор were для they в контексте свадебного торжества — сложность выше A1
- **[narrator]** minimaxai/minimax-m2.5: Выбор were для my parents в контексте ресторана — сложность выше A1
- **[narrator]** minimaxai/minimax-m2.5: Which question с Past Simple be: выбор was/were для местоположения — сложность выше A1
- **[child]** minimaxai/minimax-m2.5: Котики были голодными: выбор were для they — сложность выше A1
- **[methodist]** moonshotai/kimi-k2.5: Вопрос Why с was для he: Виктор опоздал в прошлом — сложность выше A1
- **[methodist]** moonshotai/kimi-k2.5: Муж Елены устал: выбор was для he в Past Simple — сложность выше A1
- **[trap]** moonshotai/kimi-k2.5: Many tourists in Berlin: выбор was/were с there в Past Simple — сложность выше A1
- **[colleague]** moonshotai/kimi-k2.5: Отрицание was для I: wasn't в Past Simple (контекст настроения) — сложность выше A1
- **[office]** moonshotai/kimi-k2.5: Консультанты на совещании: выбор were для множественного подлежащего в Past Simple — сложность выше A1
- **[office]** moonshotai/kimi-k2.5: Деловая презентация в прошлом: выбор was для единственного числа со временем — сложность выше A1
- **[traveler]** moonshotai/kimi-k2.5: Рюкзак с книгами из Порту: выбор was для it в Past Simple — сложность выше A1
- **[popculture]** moonshotai/kimi-k2.5: Barbenheimer: выбор were для двух фильмов в Past Simple — сложность выше A1
- **[popculture]** moonshotai/kimi-k2.5: Драконы в Ведьмаке: выбор were для множественного числа в Past Simple — сложность выше A1
... и ещё 29 вопросов

### Explanation на английском (1)
- **[popculture]** moonshotai/kimi-k2.5: Драконы в Ведьмаке: выбор were для множественного числа в Past Simple — explanation на английском

## Рекомендации по промпту

1. **Фильтр сложности:** Модели систематически генерируют вопросы на уровень A2-B1 (собирательные существительные, неопределённые местоимения, составные подлежащие через or). Нужно явно указать в промпте: «Только базовые подлежащие: I, you, he, she, it, we, they + простые существительные во множественном числе. Никаких the police, the staff, someone, everyone, nobody, one of...».

2. **Explanation на английском:** Модель moonshotai/kimi-k2.5 периодически выдаёт explanations на английском (особенно в popculture-сценариях). В промпте нужно добавить строгое требование: «Все explanations ТОЛЬКО на русском языке».

3. **HTML в choices:** Некоторые модели оборачивают choices в `<b>` или `<code>`. В промпте нужно указать: «Варианты ответа (choices[].content) — только чистый текст, без HTML-тегов».
