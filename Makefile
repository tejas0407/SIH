.PHONY: up down build logs seed seed-users test fmt clean push

up:            ## Start the full offline stack
	docker compose -f docker/docker-compose.yml --env-file .env up --build

down:
	docker compose -f docker/docker-compose.yml --env-file .env down -v

logs:
	docker compose -f docker/docker-compose.yml logs -f backend celery_worker

seed:          ## Load the demo reviewer accounts and the three land records (Cases A, B, C)
	docker compose -f docker/docker-compose.yml exec backend python -m app.seed.load_demo

seed-users:    ## Create/reset just the demo reviewer accounts
	docker compose -f docker/docker-compose.yml exec backend python -m app.seed.load_users

test:
	docker compose -f docker/docker-compose.yml exec backend pytest -q

fmt:
	cd backend && ruff check --fix . && ruff format .

clean:
	rm -rf backend/.data pgdata

push:          ## Create the GitHub repo `SIH` and push
	bash scripts/create_github_repo.sh
