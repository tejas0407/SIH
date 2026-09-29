.PHONY: help up down logs seed seed-users test fmt

help:          ## List the available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

up:            ## Build and start the local stack (http://localhost:3000)
	docker compose up --build

down:          ## Stop the stack and drop its volumes (clean slate)
	docker compose down -v

logs:          ## Follow the API and worker logs
	docker compose logs -f backend celery_worker

seed:          ## Load the demo accounts and the three demo records
	docker compose exec backend python -m app.seed.load_demo

seed-users:    ## Create or reset just the demo accounts
	docker compose exec backend python -m app.seed.load_users

test:          ## Run the backend test suite
	docker compose exec backend pytest -q

fmt:           ## Lint and format the backend
	cd backend && ruff check --fix . && ruff format .
