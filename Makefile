# Makefile for quiz-bot project

# Default target
.PHONY: help dev lint logs predev prod
help:
	@echo "Available commands:"
	@echo "  dev     - Start development server"
	@echo "  lint    - Run linting"
	@echo "  logs    - View convex logs"
	@echo "  prod    - Deploy to production server"

# Development server
dev:
	npx convex dev

# Linting
lint:
	tsc -p convex && eslint . --report-unused-disable-directives --max-warnings 0

# View convex logs
logs:
	npx convex logs

# Predev command (used internally by convex)
predev:
	npx convex dev --until-success && convex dashboard

# Deploy to production server
prod:
	npx convex deploy --yes
