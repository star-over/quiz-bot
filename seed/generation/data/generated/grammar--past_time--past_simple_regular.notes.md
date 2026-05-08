# Рецензия: grammar/past_time/past_simple_regular

**Дата:** 2026-05-08T12:18:04.911660
**Входных вопросов:** 67
**Отобрано:** 18
**Отклонено:** 49

## Покрытие KC

Отобранные вопросы покрывают следующие аспекты Past Simple правильных глаголов на уровне A1:

- **Простое -ed:** watch→watched (idx=28), finish→finished (idx=38), visit→visited (idx=39), clean→cleaned (idx=42), jump→jumped (idx=53)
- **Правило y→i:** try→tried (idx=3), reply→replied (idx=36), hurry→hurried (idx=41), carry→carried (idx=18), tidy→tidied (idx=65)
- **Удвоение согласной:** stop→stopped (idx=2), plan→planned (idx=54), admit→admitted (idx=56), shop→shopped (idx=34), drop→dropped (idx=16), clap→clapped (idx=23)
- **Глагол на немое e:** hope→hoped (idx=47), use→used (idx=52)
- **Разнообразие контекстов:** транспорт (stop), семья (watch), дверь (try), кот Bug (plan), барбекю (shop), деловая переписка (reply, finish, admit), путешествия (visit, hurry), соседка (clean), мороженое (drop), таксист (carry), внук Callum (hope), концерт (clap), Токио (tidy), Minecraft (use, jump)

**Чего не хватает:**
- Больше практики с глаголами на -e (live→lived, love→loved) — только 2 вопроса
- Разнообразие подлежащих: преобладают he/she/it, не хватает they/we в активных сценариях

## Отклонённые

### Жёсткий брак
- **[office]** minimaxai/minimax-m2.5: Танцоры выступали на фестивале — Кириллица в choices (dancеd)
- **[narrator]** minimaxai/minimax-m2.5: Ребёнок выбрал щенка — два одинаковых choices + was stopped лишнее
- **[colleague]** moonshotai/kimi-k2.5: Сосед позвонил вчера — Explanations на английском
- **[office]** google/gemma-4-31b-it: Подготовка к презентации — Нет правильного ответа (все score=0)
- **[traveler]** google/gemma-4-31b-it: Поездка в Лиссабон — Два правильных ответа (traveled + travelled)

### Дублирующиеся choices (одинаковые варианты с разными score)
- **[trap]** minimaxai/minimax-m2.5: Турист запланировал поездку: выбор Past Simple глагола plan — дублирующиеся choices
- **[colleague]** minimaxai/minimax-m2.5: Студент учился в библиотеке: выбор Past Simple глагола study — дублирующиеся choices
- **[traveler]** minimaxai/minimax-m2.5: Турист заблудился в городе: выбор V2 глагола walk в Past Simple — дублирующиеся choices
- **[popculture]** minimaxai/minimax-m2.5: Зритель смотрел Stranger Things: выбор Past Simple глагола enjoy — дублирующиеся choices
- **[popculture]** minimaxai/minimax-m2.5: DJ записал трек: выбор Past Simple глагола record — дублирующиеся choices
- **[child]** minimaxai/minimax-m2.5: Девочка плакала на уроке: выбор V2 глагола cry в Past Simple — дублирующиеся choices

## Рекомендации по промпту

1. **Дублирующиеся choices:** Модели (особенно minimaxai/minimax-m2.5) систематически генерируют два одинаковых варианта answers с разными score. Нужно добавить в промпт: «Все четыре варианта ответа должны быть разными по написанию. Запрещено дублировать правильный ответ в дистракторах».

2. **Правильные ответы у gemma:** Модель google/gemma-4-31b-it иногда ставит score=0 всем вариантам или делает два правильных ответа (traveled/travelled). В промпте нужно усилить требование: «Ровно один вариант должен иметь score: 1, остальные score: 0».

3. **Кириллица в choices:** Редкий, но критичный баг — русская буква «е» в английском слове. В промпте: «Варианты ответа должны содержать только латинские буквы, цифры и стандартную пунктуацию».
