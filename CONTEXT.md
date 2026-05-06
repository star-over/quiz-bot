# Domain Glossary

> Глоссарий доменных терминов проекта quiz-bot. Обновляется по мере углубления архитектуры.

## Core Concepts

### Answer Flow
Полный жизненный цикл ответа пользователя на вопрос: загрузка сессии → восстановление машины → проверка ответа → обновление мастерства → обновление Focus Slots → отображение фидбека → логирование → подача следующего вопроса. Глубокий модуль, скрывающий 10+ шагов оркестрации за узким интерфейсом.

### Question Delivery
Подача вопроса пользователю: подготовка текста, клавиатуры, отладочного блока, выбор канала отправки (фото/текст), fallback-логика. Часть Answer Flow. Deep module готовит *что* показать; адаптер решает *как* отправить.

### Question Session
Состояние активного вопроса, персистируемое между запросами. Содержит `questionSnapshot` (JSON-снапшот `scqMachine`) + метаданные. Загружается при обработке ответа и очищается после завершения фидбека.

### Drill Lifecycle
Жизненный цикл drill-режима, управляемый `drillMachine`. Два состояния: `idle`, `questioning`. При таймауте 30 минут — реинициализация Focus Slots.

## Adapters

### Answer Flow Adapter (`AnswerFlowDeps`)
Крупный адаптер, удовлетворяющий интерфейсу `AnswerFlowDeps`. Скрывает все Convex-запросы, мутации и Telegram-вызовы. Реальная реализация — `convex/questions/answerFlowAdapter.ts`; тестовая — в `tests/helpers/botTestHarness.ts`.

### Display Adapter
Под-интерфейс `AnswerFlowDeps`, отвечающий за механику Telegram: `sendPhoto`/`sendMessage`/`editMessageText`/`editMessageCaption`/`deleteMessage`. Политика (текст, клавиатура, фото-метаданные) живёт в Answer Flow.

## Invariants

### One Inline-Keyboard Message
В каждый момент времени в чате не более одного сообщения с inline-кнопками. Любое событие, порождающее новое сообщение с кнопками, сначала удаляет предыдущее неотвеченное.

### Unified Response Logging
Ответ и пропуск логируются единым методом `logResponse` с дискриминантом `skipped: boolean`. Это устраняет единственное ветвление answer vs skip на уровне логирования.
