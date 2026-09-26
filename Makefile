.DEFAULT_GOAL := help
.PHONY: help install dev lint typecheck test build check gis-fetch gis-local gis-health

GIS_REF := 59beb3409a7f3c5db8fbab79075ba646b8082386
GIS_PACKAGE := git+https://github.com/HackerFund/GlendaleGisMcp@$(GIS_REF)

help:
	@printf 'Firepoint commands: install dev lint typecheck test build check gis-fetch gis-local gis-health\n'

install:
	npm ci

dev:
	npm run dev

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm test

build:
	npm run build

check: lint typecheck test build

gis-fetch:
	uvx --from $(GIS_PACKAGE) glendale-gis-mcp --fetch-snapshot

# Starts a stdio MCP server for a client; it is not a web app or public endpoint.
gis-local:
	uvx --from $(GIS_PACKAGE) glendale-gis-mcp

# Public reachability only; does not verify a secret or source correctness.
gis-health:
	curl --fail --silent --show-error https://glendale-gis-mcp-1053589358088.us-west2.run.app/health
