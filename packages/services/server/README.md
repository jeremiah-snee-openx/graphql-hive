# `@hive/server`

The GraphQL API for GraphQL Hive.

## Configuration

| Name                                        | Required                                       | Description                                                                                   | Example Value                                        |
| ------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PORT`                                      | **Yes**                                        | The port this service is running on.                                                          | `4013`                                               |
| `ENCRYPTION_SECRET`                         | **Yes**                                        | Secret for encrypting stuff.                                                                  | `8ebe95cg21c1fee355e9fa32c8c33141`                   |
| `WEB_APP_URL`                               | **Yes**                                        | The url of the web app.                                                                       | `http://127.0.0.1:3000`                              |
| `RATE_LIMIT_ENDPOINT`                       | **Yes**                                        | The endpoint of the rate limiting service.                                                    | `http://127.0.0.1:4012`                              |
| `EMAILS_ENDPOINT`                           | **Yes**                                        | The endpoint of the GraphQL Hive Email service.                                               | `http://127.0.0.1:6260`                              |
| `TOKENS_ENDPOINT`                           | **Yes**                                        | The endpoint of the tokens service.                                                           | `http://127.0.0.1:6001`                              |
| `WEBHOOKS_ENDPOINT`                         | **Yes**                                        | The endpoint of the webhooks service.                                                         | `http://127.0.0.1:6250`                              |
| `SCHEMA_ENDPOINT`                           | **Yes**                                        | The endpoint of the schema service.                                                           | `http://127.0.0.1:6500`                              |
| `POSTGRES_SSL`                              | No                                             | Whether the postgres connection should be established via SSL.                                | `1` (enabled) or `0` (disabled)                      |
| `POSTGRES_HOST`                             | **Yes**                                        | Host of the postgres database                                                                 | `127.0.0.1`                                          |
| `POSTGRES_PORT`                             | **Yes**                                        | Port of the postgres database                                                                 | `5432`                                               |
| `POSTGRES_DB`                               | **Yes**                                        | Name of the postgres database.                                                                | `registry`                                           |
| `POSTGRES_USER`                             | **Yes**                                        | User name for accessing the postgres database.                                                | `postgres`                                           |
| `POSTGRES_PASSWORD`                         | **Yes**                                        | Password for accessing the postgres database.                                                 | `postgres`                                           |
| `CLICKHOUSE_PROTOCOL`                       | **Yes**                                        | The clickhouse protocol for connecting to the clickhouse instance.                            | `http`                                               |
| `CLICKHOUSE_HOST`                           | **Yes**                                        | The host of the clickhouse instance.                                                          | `127.0.0.1`                                          |
| `CLICKHOUSE_PORT`                           | **Yes**                                        | The port of the clickhouse instance                                                           | `8123`                                               |
| `CLICKHOUSE_USERNAME`                       | **Yes**                                        | The username for accessing the clickhouse instance.                                           | `test`                                               |
| `CLICKHOUSE_PASSWORD`                       | **Yes**                                        | The password for accessing the clickhouse instance.                                           | `test`                                               |
| `REDIS_HOST`                                | **Yes**                                        | The host of your redis instance.                                                              | `"127.0.0.1"`                                        |
| `REDIS_PORT`                                | **Yes**                                        | The port of your redis instance.                                                              | `6379`                                               |
| `REDIS_PASSWORD`                            | **Yes**                                        | The password of your redis instance.                                                          | `"apollorocks"`                                      |
| `SUPERTOKENS_CONNECTION_URI`                | **Yes**                                        | The URI of the SuperTokens instance.                                                          | `http://127.0.0.1:3567`                              |
| `SUPERTOKENS_API_KEY`                       | **Yes**                                        | The API KEY of the SuperTokens instance.                                                      | `iliketurtlesandicannotlie`                          |
| `INTEGRATION_GITHUB`                        | No                                             | Whether the GitHub integration is enabled                                                     | `1` (enabled) or `0` (disabled)                      |
| `INTEGRATION_GITHUB_GITHUB_APP_ID`          | No (Yes if `INTEGRATION_GITHUB` is set to `1`) | The GitHub app id.                                                                            | `123`                                                |
| `INTEGRATION_GITHUB_GITHUB_APP_PRIVATE_KEY` | No (Yes if `INTEGRATION_GITHUB` is set to `1`) | The GitHub app private key.                                                                   | `letmein1`                                           |
| `AUTH_AUTH_ORGANIZATION_OIDC`               | No                                             | Whether linking a Hive organization to an Open ID Connect provider is allowed. (Default: `0`) | `1` (enabled) or `0` (disabled)                      |
| `ENVIRONMENT`                               | No                                             | The environment of your Hive app. (**Note:** This will be used for Sentry reporting.)         | `staging`                                            |
| `SENTRY`                                    | No                                             | Whether Sentry error reporting should be enabled.                                             | `1` (enabled) or `0` (disabled)                      |
| `SENTRY_DSN`                                | No                                             | The DSN for reporting errors to Sentry.                                                       | `https://dooobars@o557896.ingest.sentry.io/12121212` |
| `PROMETHEUS_METRICS`                        | No                                             | Whether Prometheus metrics should be enabled                                                  | `1` (enabled) or `0` (disabled)                      |
| `PROMETHEUS_METRICS_LABEL_INSTANCE`         | No                                             | The instance label added for the prometheus metrics.                                          | `server`                                             |

## Hive Hosted Configuration

If you are self-hosting GraphQL Hive, you can ignore this section. It is only required for the SaaS version.

| Name                                 | Required                                   | Description                                  | Example Value                      |
| ------------------------------------ | ------------------------------------------ | -------------------------------------------- | ---------------------------------- |
| `BILLING_ENDPOINT`                   | **Yes**                                    | The endpoint of the Hive Billing service.    | `http://127.0.0.1:4013`            |
| `USAGE_ESTIMATOR_ENDPOINT`           | No                                         | The endpoint of the usage estimator service. | `4011`                             |
| `CDN`                                | No                                         | Whether the CDN is enabled.                  | `1` (enabled) or `0` (disabled)    |
| `CDN_AUTH_PRIVATE_KEY`               | No (**Yes** if `CDN` is `1`)               | The cdn private key                          | `103df4521212121269213971ce28b5b0` |
| `CDN_BASE_URL`                       | No (**Yes** if `CDN` is `1`)               | The endpoint of the Hive Billing service.    | `https://cdn.graphql-hive.com`     |
| `CDN_CF_BASE_PATH`                   | No (**Yes** if `CDN` is `1`)               | The endpoint of the Hive Billing service.    | `https://cdn.graphql-hive.com`     |
| `CDN_CF_ACCOUNT_ID`                  | No (**Yes** if `CDN` is `1`)               | The endpoint of the Hive Billing service.    | `103df45224310d669213971ce28b5b70` |
| `CDN_CF_AUTH_TOKEN`                  | No (**Yes** if `CDN` is `1`)               | The endpoint of the Hive Billing service.    | `85e20c26c03759603c0f45884824a1c3` |
| `CDN_CF_NAMESPACE_ID`                | No (**Yes** if `CDN` is `1`)               | The cloudflare namespace name.               | `33b1e3bbb4a4707d05ea0307cbb55c79` |
| `AUTH_LEGACY_AUTH0`                  | No                                         | Whether the legacy Auth0 import is enabled.  | `1` (enabled) or `0` (disabled)    |
| `AUTH_LEGACY_AUTH0_INTERNAL_API_KEY` | No (**Yes** if `AUTH_LEGACY_AUTH0` is set) | The internal endpoint key.                   | `iliketurtles`                     |
| `HIVE`                               | No                                         | The internal endpoint key.                   | `iliketurtles`                     |
| `HIVE_API_TOKEN`                     | No (**Yes** if `HIVE` is set)              | The internal endpoint key.                   | `iliketurtles`                     |
| `HIVE_USAGE`                         | No                                         | The internal endpoint key.                   | `1` (enabled) or `0` (disabled)    |
| `HIVE_USAGE_ENDPOINT`                | No                                         | The endpoint used for usage reporting.       | `http://127.0.0.1:4001`            |
| `HIVE_REPORTING`                     | No                                         | The internal endpoint key.                   | `iliketurtles`                     |
| `HIVE_REPORTING_ENDPOINT`            | No                                         | The internal endpoint key.                   | `http://127.0.0.1:4000/graphql`    |
