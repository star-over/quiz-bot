# Makefile for quiz-bot project

# Default target
.PHONY: help
help:
	@echo "Available commands:"
	@echo "  dev     - Start development server"
	@echo "  lint    - Run linting"
	@echo "  logs    - View convex logs"

# Development server
.PHONY: dev
dev:
	npm run dev

# Linting
.PHONY: lint
lint:
	npm run lint

# View convex logs
.PHONY: logs
logs:
	npm run logs

# Predev command (used internally by convex)
.PHONY: predev
predev:
	npm run predev
