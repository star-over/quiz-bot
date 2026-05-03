SHELL := /bin/bash
.DEFAULT_GOAL := help

CONVEX := npx convex
TSC    := npx tsc
ESLINT := npx eslint

# ==============================================================================
# Справка
# ==============================================================================

.PHONY: help
help:
	@echo "Использование: make [цель]"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ==============================================================================
# Разработка
# ==============================================================================

.PHONY: dev
dev: ## Запустить сервер разработки
	$(MAKE) lint
	$(MAKE) test
	@echo "→ Запускаем Convex dev..."
	$(CONVEX) dev

.PHONY: lint
lint: ## Проверить типы (tsc) и стиль кода (eslint)
	@echo "→ Проверка типов..."
	$(TSC) -p convex
	@echo "→ Проверка стиля кода..."
	$(ESLINT) . --cache --cache-location node_modules/.cache/eslint/

.PHONY: lint-fix
lint-fix: ## Автоисправить замечания eslint
	@echo "→ Автоисправление..."
	$(ESLINT) . --cache --cache-location node_modules/.cache/eslint/ --fix

.PHONY: logs
logs: ## Смотреть логи Convex в реальном времени
	@echo "→ Подключаемся к логам..."
	$(CONVEX) logs

# ==============================================================================
# Тесты
# ==============================================================================

.PHONY: test
test: ## Запустить все тесты (unit + machines + integration)
	@echo "→ Запускаем тесты..."
	npx vitest run --reporter=dot --passWithNoTests

.PHONY: test-coverage
test-coverage: ## Запустить тесты с отчётом о покрытии
	@echo "→ Запускаем тесты с покрытием..."
	npx vitest --coverage --run

# ==============================================================================
# Генерация вопросов
# ==============================================================================

.PHONY: gen
gen: ## Генерировать вопросы (MODEL= KC= LEVEL= AUTHORS= MAX=)
	@echo "→ Генерация вопросов..."
	npx tsx seed/generation/src/generate.ts \
		--model $(or $(MODEL),claude-sonnet-4-5-20250514) \
		$(if $(KC),--kc $(KC)) \
		$(if $(LEVEL),--level $(LEVEL)) \
		$(if $(CATEGORY),--category $(CATEGORY)) \
		$(if $(AUTHORS),--authors $(AUTHORS)) \
		$(if $(MAX),--max $(MAX))

.PHONY: gen-dry
gen-dry: ## Показать план генерации без вызова LLM
	@echo "→ План генерации..."
	npx tsx seed/generation/src/generate.ts --dry-run \
		--model $(or $(MODEL),claude-sonnet-4-5-20250514) \
		$(if $(KC),--kc $(KC)) \
		$(if $(LEVEL),--level $(LEVEL)) \
		$(if $(CATEGORY),--category $(CATEGORY)) \
		$(if $(AUTHORS),--authors $(AUTHORS)) \
		$(if $(MAX),--max $(MAX))

.PHONY: gen-compile
gen-compile: ## Собрать seed/questions.json из сгенерированных файлов
	@echo "→ Компиляция вопросов..."
	npx tsx seed/generation/src/compile.ts

.PHONY: gen-review
gen-review: ## Рецензировать вопросы через Claude Sonnet 4 (KC= LEVEL= CATEGORY=)
	@echo "→ Рецензия вопросов..."
	npx tsx seed/generation/src/review.ts \
		$(if $(KC),--kc $(KC)) \
		$(if $(LEVEL),--level $(LEVEL)) \
		$(if $(CATEGORY),--category $(CATEGORY))

.PHONY: gen-review-dry
gen-review-dry: ## Показать план рецензии без вызова LLM
	@echo "→ План рецензии..."
	npx tsx seed/generation/src/review.ts --dry-run \
		$(if $(KC),--kc $(KC)) \
		$(if $(LEVEL),--level $(LEVEL)) \
		$(if $(CATEGORY),--category $(CATEGORY))

.PHONY: gen-stats
gen-stats: ## Показать статистику сгенерированных вопросов
	npx tsx seed/generation/src/compile.ts --stats-only

# ==============================================================================
# Данные
# ==============================================================================

.PHONY: seed-validate
seed-validate: ## Проверить seed/questions.json (схема, типы, уникальность)
	@echo "→ Валидация seed-данных..."
	npx tsx seed/generation/validate.ts

.PHONY: seed
seed: seed-validate ## Загрузить вопросы в базу данных (требует запущенного dev)
	@echo "→ Загружаем вопросы в Convex..."
	@node seed/generation/seed.mjs

.PHONY: codegen
codegen: ## Перегенерировать типы Convex API
	@echo "→ Генерация типов..."
	$(CONVEX) codegen

.PHONY: debug-clear
debug-clear: ## [DEBUG] Очистить все таблицы (users, questions, answerLog)
	@echo "→ Очищаем все таблицы..."
	@$(CONVEX) run development:debugClearAll | jq -r '.'

# ==============================================================================
# Деплой
# ==============================================================================

.PHONY: setup-webhook
setup-webhook: ## Настроить Telegram webhook (один раз после деплоя)
	@echo "→ Настраиваем Telegram webhook..."
	@$(CONVEX) run development:setupWebhook

.PHONY: prod
prod: lint ## Задеплоить в production
	@echo "→ Деплой в production..."
	$(CONVEX) deploy --yes
