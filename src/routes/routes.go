package routes

import (
	"net/http"

	authservices "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	gql "github.com/Hassan-KreateStudio/IT-Project-Backend/src/graphql"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/middleware"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes/db"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes/ping"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/go-chi/chi/v5"
)

func Register(app *chi.Mux, client *neo4jdb.Client, resolver *gql.Resolver, auth *authservices.Service) {
	app.Route("/ping", ping.Register)
	app.Route("/db", func(r chi.Router) {
		db.Register(r, client)
	})

	server := handler.NewDefaultServer(gql.NewExecutableSchema(gql.Config{Resolvers: resolver}))

	app.Get("/graphql", playground.Handler("GraphQL playground", "/graphql"))
	app.With(middleware.OptionalAuth(auth)).Method(http.MethodPost, "/graphql", server)
}
