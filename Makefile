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
	$(ESLINT) . --report-unused-disable-directives

.PHONY: seed
seed: predev ## 🌱 Seed the database with initial data
	@$(CONVEX) import --table questions seed/questions.json --replace --yes

.PHONY: debug-clear
debug-clear: ## 🗑️ (DEBUG) Clear the questions table
	@echo "Clearing questions table..."
	@$(CONVEX) run development:debugClearQuestions

.PHONY: test-query
test-query: predev ## 🧪 Test the getRandomQuestion query
	@$(CONVEX) run queries:getRandomQuestion '{"dummy": 0}'

.PHONY: test-mutation
test-mutation: predev ## 🧪 Test the startQuiz mutation
	@$(CONVEX) run mutations:startQuiz

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
