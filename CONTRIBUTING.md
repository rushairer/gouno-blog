# Contributing

Use the toolchain versions in the Go modules and frontend CI configuration.
Run backend tests, race detection, vet and govulncheck, `npm run quality` in
`blog-frontend`, and the [isolated database integration gate](docs/quality/database-tests.md)
before opening a pull request. The database gate uses Python 3, Go and Docker;
run `python3 scripts/check-db-integration.py` from the repository root.

Check production Compose and `node scripts/check-auth-deployment-contract.mjs`
when changing deployment or authentication configuration. Authentication unit
tests live in the BFF, middleware and router packages. There is currently no
checked-in standalone browser authentication smoke suite; do not claim the
deployment contract check is an end-to-end login test. Full identity smoke
coverage is tracked in quality task Q05.

Commits use Conventional Commits and user-visible changes update the root CHANGELOG.

Contributions are licensed under the repository's MIT License.
