.PHONY: up down logs build run migrate gqlgen render-push render-create render-deploy

# Local secrets (not committed)
-include .env
-include .deploy.env
export

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f api

build:
	go build -o bin/api ./src

run:
	go run ./src

migrate:
	go run ./src -migrate-only

gqlgen:
	GOTOOLCHAIN=go1.25.5 go run github.com/99designs/gqlgen generate

# Render (no GitHub): build locally → Docker Hub → Render pulls the image.
# Requires: docker login, render login, DOCKERHUB_USER.
# Set JWT_SECRET and NEO4J_* in the Render dashboard, not in git.
DOCKERHUB_USER ?=
IMAGE_TAG ?= latest
IMAGE ?= $(DOCKERHUB_USER)/it-project-backend:$(IMAGE_TAG)

render-push:
	@test -n "$(DOCKERHUB_USER)" || (echo "Set DOCKERHUB_USER in .deploy.env"; exit 1)
	docker build --platform linux/amd64 -t $(IMAGE) .
	docker push $(IMAGE)

render-create:
	@test -n "$(DOCKERHUB_USER)" || (echo "Set DOCKERHUB_USER in .deploy.env"; exit 1)
	@render workspace set "$(or $(RENDER_WORKSPACE),My Workspace)" >/dev/null 2>&1 || render workspace set
	render services create \
		--name it-project-backend \
		--type web_service \
		--runtime image \
		--image docker.io/$(IMAGE) \
		--plan free \
		--health-check-path /ping \
		--env-var 'PORT=8080' \
		--confirm -o json
	@echo ""
	@echo "Next: Render dashboard → it-project-backend → Environment"
	@echo "Add JWT_SECRET, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE=neo4j, REDIS_URL"
	@echo "Copy the service id into .deploy.env as RENDER_SERVICE_ID, then make render-deploy."

render-deploy:
	@test -n "$(DOCKERHUB_USER)" || (echo "Set DOCKERHUB_USER in .deploy.env"; exit 1)
	@test -n "$(RENDER_SERVICE_ID)" || (echo "Set RENDER_SERVICE_ID in .deploy.env after make render-create"; exit 1)
	$(MAKE) render-push
	render deploys create $(RENDER_SERVICE_ID) --image docker.io/$(IMAGE) --wait --confirm
