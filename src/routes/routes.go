package routes

import (
	"net/http"

	authservices "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	gql "github.com/Hassan-KreateStudio/IT-Project-Backend/src/graphql"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/middleware"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes/db"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes/graph"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes/ping"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

func Register(app *chi.Mux, client *neo4jdb.Client, resolver *gql.Resolver, auth *authservices.Service, cache *redis.Client, graphExplorer string) {
	app.Route("/ping", ping.Register)
	app.Route("/graph", func(r chi.Router) {
		r.Use(graph.Protect(graphExplorer, func(req *http.Request) bool {
			return middleware.Authorized(req, auth, cache)
		}))
		graph.Register(r, client)
	})
	app.Route("/db", func(r chi.Router) {
		db.Register(r, client)
	})

	server := handler.NewDefaultServer(gql.NewExecutableSchema(gql.Config{Resolvers: resolver}))

	app.Get("/graphql", playground.Handler("GraphQL playground", "/graphql"))
	app.With(middleware.OptionalAuth(auth, cache)).Method(http.MethodPost, "/graphql", server)
}
