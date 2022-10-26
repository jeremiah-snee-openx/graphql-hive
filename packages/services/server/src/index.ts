#!/usr/bin/env node

import 'reflect-metadata';
import { createServer, startMetrics, registerShutdown, reportReadiness } from '@hive/service-common';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify/dist/trpc-server-adapters-fastify.cjs.js';
import { createRegistry, LogFn, Logger } from '@hive/api';
import { createStorage as createPostgreSQLStorage, createConnectionString } from '@hive/storage';
import got from 'got';
import { stripIgnoredCharacters } from 'graphql';
import * as Sentry from '@sentry/node';
import { Dedupe, ExtraErrorData } from '@sentry/integrations';
import { internalApiRouter, createContext } from './api';
import { asyncStorage } from './async-storage';
import { graphqlHandler } from './graphql-handler';
import { clickHouseReadDuration, clickHouseElapsedDuration } from './metrics';
import zod from 'zod';
import { env } from './environment';

const LegacySetUserIdMappingPayloadModel = zod.object({
  auth0UserId: zod.string(),
  superTokensUserId: zod.string(),
});

const LegacyCheckAuth0EmailUserExistsPayloadModel = zod.object({
  email: zod.string(),
});

export async function main() {
  if (env.sentry) {
    Sentry.init({
      serverName: 'api',
      enabled: !!env.sentry,
      environment: env.environment,
      dsn: env.sentry.dsn,
      tracesSampleRate: 1,
      release: env.release,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.ContextLines(),
        new Sentry.Integrations.LinkedErrors(),
        new ExtraErrorData({
          depth: 2,
        }),
        new Dedupe(),
      ],
      maxBreadcrumbs: 5,
      defaultIntegrations: false,
      autoSessionTracking: false,
    });
  }

  const server = await createServer({
    name: 'graphql-api',
    tracing: true,
  });

  const storage = await createPostgreSQLStorage(createConnectionString(env.postgres), 10);

  registerShutdown({
    logger: server.log,
    async onShutdown() {
      await server.close();
      await storage.destroy();
    },
  });

  function createErrorHandler(level: Sentry.SeverityLevel): LogFn {
    return (error: any, errorLike?: any, ...args: any[]) => {
      server.log.error(error, errorLike, ...args);

      const errorObj = error instanceof Error ? error : errorLike instanceof Error ? errorLike : null;

      if (errorObj instanceof Error) {
        Sentry.captureException(errorObj, {
          level,
          extra: {
            error,
            errorLike,
            rest: args,
          },
        });
      }
    };
  }

  function getRequestId() {
    const store = asyncStorage.getStore();

    return store?.requestId;
  }

  function wrapLogFn(fn: LogFn): LogFn {
    return (msg, ...args) => {
      const requestId = getRequestId();

      if (requestId) {
        fn(msg + ` - (requestId=${requestId})`, ...args);
      } else {
        fn(msg, ...args);
      }
    };
  }

  try {
    const errorHandler = createErrorHandler('error');
    const fatalHandler = createErrorHandler('fatal');

    // eslint-disable-next-line no-inner-declarations
    function createGraphQLLogger(binds: Record<string, any> = {}): Logger {
      return {
        error: wrapLogFn(errorHandler),
        fatal: wrapLogFn(fatalHandler),
        info: wrapLogFn(server.log.info.bind(server.log)),
        warn: wrapLogFn(server.log.warn.bind(server.log)),
        trace: wrapLogFn(server.log.trace.bind(server.log)),
        debug: wrapLogFn(server.log.debug.bind(server.log)),
        child(bindings) {
          return createGraphQLLogger({
            ...binds,
            ...bindings,
            requestId: getRequestId(),
          });
        },
      };
    }

    const graphqlLogger = createGraphQLLogger();
    const registry = createRegistry({
      tokens: {
        endpoint: env.hiveServices.tokens.endpoint,
      },
      billing: {
        endpoint: env.hiveServices.billing ? env.hiveServices.billing.endpoint : null,
      },
      emailsEndpoint: env.hiveServices.emails ? env.hiveServices.emails.endpoint : undefined,
      webhooks: {
        endpoint: env.hiveServices.webhooks.endpoint,
      },
      schemaService: {
        endpoint: env.hiveServices.schema.endpoint,
      },
      usageEstimationService: {
        endpoint: env.hiveServices.usageEstimator ? env.hiveServices.usageEstimator.endpoint : null,
      },
      rateLimitService: {
        endpoint: env.hiveServices.rateLimit ? env.hiveServices.rateLimit.endpoint : null,
      },
      logger: graphqlLogger,
      storage,
      trackingKey: env.tracking.key,
      redis: {
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
      },
      githubApp: env.github,
      clickHouse: {
        protocol: env.clickhouse.protocol,
        host: env.clickhouse.host,
        port: env.clickhouse.port,
        username: env.clickhouse.username,
        password: env.clickhouse.password,
        onReadEnd(query, timings) {
          clickHouseReadDuration.labels({ query }).observe(timings.totalSeconds);
          clickHouseElapsedDuration.labels({ query }).observe(timings.elapsedSeconds);
        },
      },
      cdn: env.cdn
        ? {
            authPrivateKey: env.cdn.auth.privateKey,
            baseUrl: env.cdn.baseUrl,
            cloudflare: env.cdn.cloudflare,
          }
        : null,
      encryptionSecret: env.encryptionSecret,
      feedback: {
        token: 'noop',
        channel: 'noop',
      },
      schemaConfig: env.hiveServices.webApp
        ? {
            schemaPublishLink(input) {
              let url = `${env.hiveServices.webApp!.url}/${input.organization.cleanId}/${input.project.cleanId}/${
                input.target.cleanId
              }`;

              if (input.version) {
                url += `/history/${input.version.id}`;
              }

              return url;
            },
          }
        : {},
    });
    const graphqlPath = '/graphql';
    const port = env.http.port;
    const signature = Math.random().toString(16).substr(2);
    const graphql = graphqlHandler({
      graphiqlEndpoint: graphqlPath,
      registry,
      signature,
      supertokens: {
        connectionUri: env.supertokens.connectionURI,
        apiKey: env.supertokens.apiKey,
      },
      isProduction: env.environment === 'prod',
      release: env.release,
      hiveConfig: env.hive,
    });

    server.route({
      method: ['GET', 'POST'],
      url: graphqlPath,
      handler: graphql,
    });

    const introspection = JSON.stringify({
      query: stripIgnoredCharacters(/* GraphQL */ `
        query readiness {
          __schema {
            queryType {
              name
            }
          }
        }
      `),
      operationName: 'readiness',
    });

    await server.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: {
        router: internalApiRouter,
        createContext() {
          return createContext({ storage });
        },
      },
    });

    server.route({
      method: ['GET', 'HEAD'],
      url: '/_health',
      async handler(req, res) {
        res.status(200).send(); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
      },
    });

    server.route({
      method: 'GET',
      url: '/lab/:org/:project/:target',
      async handler(req, res) {
        res.status(200).send({ ok: true }); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
      },
    });

    server.route({
      method: ['GET', 'HEAD'],
      url: '/_readiness',
      async handler(req, res) {
        try {
          const response = await got.post(`http://0.0.0.0:${port}${graphqlPath}`, {
            method: 'POST',
            body: introspection,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'x-signature': signature,
            },
          });

          if (response.statusCode >= 200 && response.statusCode < 300) {
            if (response.body.includes('"__schema"')) {
              reportReadiness(true);
              res.status(200).send(); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
              return;
            }
          }
          console.error(response.statusCode, response.body);
        } catch (error) {
          console.error(error);
        }

        reportReadiness(false);
        res.status(500).send(); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
      },
    });

    if (env.legacyAuth0) {
      const auth0Config = env.legacyAuth0;
      server.route({
        method: 'POST',
        url: '/__legacy/update_user_id_mapping',
        async handler(req, reply) {
          if (req.headers['x-authorization'] !== auth0Config.apiKey) {
            reply.status(401).send({ error: 'Invalid update user id mapping key.', code: 'ERR_INVALID_KEY' }); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
            return;
          }

          const { auth0UserId, superTokensUserId } = LegacySetUserIdMappingPayloadModel.parse(req.body);

          await storage.setSuperTokensUserId({
            auth0UserId: auth0UserId.replace('google|', 'google-oauth2|'),
            superTokensUserId,
            externalUserId: auth0UserId,
          });
          reply.status(200).send(); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
        },
      });
      server.route({
        method: 'POST',
        url: '/__legacy/check_auth0_email_user_without_associated_supertoken_id_exists',
        async handler(req, reply) {
          if (req.headers['x-authorization'] !== auth0Config.apiKey) {
            reply.status(401).send({ error: 'Invalid update user id mapping key.', code: 'ERR_INVALID_KEY' }); // eslint-disable-line @typescript-eslint/no-floating-promises -- false positive, FastifyReply.then returns void
            return;
          }

          const { email } = LegacyCheckAuth0EmailUserExistsPayloadModel.parse(req.body);

          const user = await storage.getUserWithoutAssociatedSuperTokenIdByAuth0Email({
            email,
          });

          await reply.status(200).send({
            user: user
              ? {
                  id: user.id,
                  email: user?.email,
                  auth0UserId: user.externalAuthUserId,
                }
              : null,
          });
        },
      });
    }

    if (env.prometheus) {
      await startMetrics(env.prometheus.labels.instance);
    }

    await server.listen(port, '0.0.0.0');
  } catch (error) {
    server.log.fatal(error);
    Sentry.captureException(error, {
      level: 'fatal',
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
