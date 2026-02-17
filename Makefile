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
	convex dev

# Linting
.PHONY: lint
lint:
	tsc -p convex && eslint . --report-unused-disable-directives --max-warnings 0

# View convex logs
.PHONY: logs
logs:
	convex logs

# Predev command (used internally by convex)
.PHONY: predev
predev:
	convex dev --until-success && convex dashboard
