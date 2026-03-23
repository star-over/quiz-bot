# Makefile for the quiz-bot project

# Define shell and flags
SHELL := /bin/bash
.DEFAULT_GOAL := help

# Define variables for commands
CONVEX := npx convex
TSC := npx tsc
ESLINT := npx eslint

.PHONY: help
help: ## ✨ Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: dev
dev: lint ## 🚀 Start the development server
	$(CONVEX) dev

.PHONY: lint
lint: ## 🔍 Run linting and type checking
	$(TSC) -p convex
	$(ESLINT) . --cache --cache-location node_modules/.cache/eslint/ --max-warnings 0

.PHONY: lint-fix
lint-fix: ## 🔧 Auto-fix ESLint warnings
	$(ESLINT) . --cache --cache-location node_modules/.cache/eslint/ --fix

.PHONY: test
test: ## 🧪 Run unit and machine tests
	npx vitest run

.PHONY: test-watch
test-watch: ## 🧪 Run tests in watch mode
	npx vitest

.PHONY: validate-seed
validate-seed: ## 🔎 Validate seed data (JSON structure, refs, uniqueness)
	@node seed/validate.mjs

.PHONY: seed
seed: validate-seed predev ## 🌱 Seed the database with initial data
	@node seed/seed.mjs

.PHONY: debug-clear-all
debug-clear-all: ## 🗑️ (DEBUG) Удалить все документы из всех таблиц (users, questions, answerLog)
	@echo "Очищаем все таблицы..."
	@$(CONVEX) run development:debugClearAll | jq -r '.'

.PHONY: test-query
test-query: predev ## 🧪 Test the getRandomQuestion query
	@$(CONVEX) run queries:getRandomQuestion '{"random": 0.5}'

.PHONY: test-mutation
test-mutation: predev ## 🧪 Test the startQuiz mutation
	@$(CONVEX) run mutations:startQuiz

.PHONY: setup-webhook
setup-webhook: predev ## 🔗 Настроить Telegram webhook (вызывать один раз после деплоя или смены окружения)
	@$(CONVEX) run development:setupWebhook

.PHONY: codegen
codegen: ## 🧬 Regenerate backend type definitions
	@$(CONVEX) codegen

.PHONY: logs
logs: ## 📜 View Convex logs
	$(CONVEX) logs

.PHONY: prod
prod: lint ## 📦 Deploy to production
	$(CONVEX) deploy --yes

# Internal command, not shown in help
.PHONY: predev
predev: lint
	@$(CONVEX) dev --until-success

# ==============================================================================
# EXTERNAL TOOLS
# ==============================================================================

# reinstall-gemini-cli - выполняет принудительную переустановку @google/gemini-cli.
# Эта команда решает проблему с ошибкой ENOTEMPTY, которая возникает из-за
# поврежденного состояния пакета, принудительно удаляя его директорию.
.PHONY: reinstall-gemini-cli
reinstall-gemini-cli:
	@echo "🔥 Принудительная переустановка @google/gemini-cli..."
	@echo "1/3: Очистка кэша npm..."
	rm -rf "$(shell npm config get cache)/_cacache"
	@echo "2/3: Определение пути к глобальным модулям и принудительное удаление пакета..."
	$(eval NPM_GLOBAL_ROOT := $(shell npm root -g))
	rm -rf "$(NPM_GLOBAL_ROOT)/@google/gemini-cli"
	@echo "3/3: Установка последней версии..."
	npm install -g @google/gemini-cli@latest
	@echo "✅ @google/gemini-cli успешно переустановлен."
