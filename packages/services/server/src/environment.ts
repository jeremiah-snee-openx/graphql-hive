import zod from 'zod';

const isNumberString = (input: unknown) => zod.string().regex(/^\d+$/).safeParse(input).success;

const numberFromNumberOrNumberString = (input: unknown): number | undefined => {
  if (typeof input == 'number') return input;
  if (isNumberString(input)) return Number(input);
};

const NumberFromString = zod.preprocess(numberFromNumberOrNumberString, zod.number().min(1));

// treat an empty string (`''`) as undefined
const emptyString = <T extends zod.ZodType>(input: T) => {
  return zod.preprocess((value: unknown) => {
    if (value === '') return undefined;
    return value;
  }, input);
};

const EnvironmentModel = zod.object({
  PORT: emptyString(NumberFromString.optional()),
  ENVIRONMENT: emptyString(zod.string().optional()),
  RELEASE: emptyString(zod.string().optional()),
  ENCRYPTION_SECRET: emptyString(zod.string()),
  WEB_APP_URL: emptyString(zod.string().url().optional()),
  RATE_LIMIT_ENDPOINT: emptyString(zod.string().url().optional()),
  TOKENS_ENDPOINT: zod.string().url(),
  USAGE_ESTIMATOR_ENDPOINT: emptyString(zod.string().url().optional()),
  BILLING_ENDPOINT: emptyString(zod.string().url().optional()),
  EMAILS_ENDPOINT: emptyString(zod.string().url().optional()),
  WEBHOOKS_ENDPOINT: zod.string().url(),
  SCHEMA_ENDPOINT: zod.string().url(),
  TRACKING_KEY: emptyString(zod.string().optional()),
});

const SentryModel = zod.union([
  zod.object({
    SENTRY: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    SENTRY: zod.literal('1'),
    SENTRY_DSN: zod.string(),
  }),
]);

const PostgresModel = zod.object({
  POSTGRES_SSL: emptyString(zod.union([zod.literal('1'), zod.literal('0')]).optional()),
  POSTGRES_HOST: zod.string(),
  POSTGRES_PORT: NumberFromString,
  POSTGRES_DB: zod.string(),
  POSTGRES_USER: zod.string(),
  POSTGRES_PASSWORD: zod.string(),
});

const ClickHouseModel = zod.object({
  CLICKHOUSE_PROTOCOL: zod.union([zod.literal('http'), zod.literal('https')]),
  CLICKHOUSE_HOST: zod.string(),
  CLICKHOUSE_PORT: NumberFromString,
  CLICKHOUSE_USERNAME: zod.string(),
  CLICKHOUSE_PASSWORD: zod.string(),
});

const RedisModel = zod.object({
  REDIS_HOST: zod.string(),
  REDIS_PORT: NumberFromString,
  REDIS_PASSWORD: emptyString(zod.string().optional()),
});

const SuperTokensModel = zod.object({
  SUPERTOKENS_CONNECTION_URI: zod.string().url(),
  SUPERTOKENS_API_KEY: zod.string(),
});

const GitHubModel = zod.union([
  zod.object({
    INTEGRATION_GITHUB: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    INTEGRATION_GITHUB: zod.literal('1'),
    INTEGRATION_GITHUB_APP_ID: NumberFromString,
    INTEGRATION_GITHUB_APP_PRIVATE_KEY: zod.string(),
  }),
]);

const CdnModel = zod.union([
  zod.object({
    CDN: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    CDN: zod.literal('1'),
    CDN_AUTH_PRIVATE_KEY: zod.string(),
    CDN_BASE_URL: zod.string(),
    CDN_CF_BASE_PATH: zod.string(),
    CDN_CF_ACCOUNT_ID: zod.string(),
    CDN_CF_AUTH_TOKEN: zod.string(),
    CDN_CF_NAMESPACE_ID: zod.string(),
  }),
]);

const HiveModel = zod.union([
  zod.object({ HIVE: emptyString(zod.literal('0').optional()) }),
  zod.object({
    HIVE: zod.literal('1'),
    HIVE_API_TOKEN: zod.string(),
    HIVE_USAGE: zod.union([zod.literal('0'), zod.literal('1')]).optional(),
    HIVE_USAGE_ENDPOINT: zod.string().url().optional(),
    HIVE_REPORTING: zod.union([zod.literal('0'), zod.literal('1')]).optional(),
    HIVE_REPORTING_ENDPOINT: zod.string().url().optional(),
  }),
]);

const AuthLegacyAuth0Model = zod.union([
  zod.object({
    AUTH_LEGACY_AUTH0: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    AUTH_LEGACY_AUTH0: zod.literal('1'),
    AUTH_LEGACY_AUTH0_INTERNAL_API_KEY: zod.string(),
  }),
]);

const PrometheusModel = zod.object({
  PROMETHEUS_METRICS: emptyString(zod.union([zod.literal('0'), zod.literal('1')]).optional()),
  PROMETHEUS_METRICS_LABEL_INSTANCE: emptyString(zod.string().optional()),
});

const configs = {
  // eslint-disable-next-line no-process-env
  base: EnvironmentModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  sentry: SentryModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  postgres: PostgresModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  clickhouse: ClickHouseModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  redis: RedisModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  supertokens: SuperTokensModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  github: GitHubModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  cdn: CdnModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  prometheus: PrometheusModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  authLegacyAuth0: AuthLegacyAuth0Model.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  hive: HiveModel.safeParse(process.env),
};

const environmentErrors: Array<string> = [];

for (const config of Object.values(configs)) {
  if (config.success === false) {
    environmentErrors.push(JSON.stringify(config.error.format(), null, 4));
  }
}

if (environmentErrors.length) {
  const fullError = environmentErrors.join(`\n`);
  console.error('❌ Invalid environment variables:', fullError);
  process.exit(1);
}

function extractConfig<Input, Output>(config: zod.SafeParseReturnType<Input, Output>): Output {
  if (!config.success) {
    throw new Error('Something went wrong.');
  }
  return config.data;
}

const base = extractConfig(configs.base);
const postgres = extractConfig(configs.postgres);
const sentry = extractConfig(configs.sentry);
const clickhouse = extractConfig(configs.clickhouse);
const redis = extractConfig(configs.redis);
const supertokens = extractConfig(configs.supertokens);
const github = extractConfig(configs.github);
const prometheus = extractConfig(configs.prometheus);
const cdn = extractConfig(configs.cdn);
const authLegacyAuth0 = extractConfig(configs.authLegacyAuth0);
const hive = extractConfig(configs.hive);

const hiveConfig =
  hive.HIVE === '1'
    ? {
        token: hive.HIVE_API_TOKEN,
        reporting: hive.HIVE_REPORTING === '1' ? { endpoint: hive.HIVE_REPORTING_ENDPOINT ?? null } : null,
        usage: hive.HIVE_USAGE === '1' ? { endpoint: hive.HIVE_USAGE_ENDPOINT ?? null } : null,
      }
    : null;

export type HiveConfig = typeof hiveConfig;

export const env = {
  environment: base.ENVIRONMENT,
  release: base.RELEASE ?? 'local',
  encryptionSecret: base.ENCRYPTION_SECRET,
  hiveServices: {
    webApp: base.WEB_APP_URL
      ? {
          url: base.WEB_APP_URL,
        }
      : null,
    tokens: {
      endpoint: base.TOKENS_ENDPOINT,
    },
    rateLimit: base.RATE_LIMIT_ENDPOINT
      ? {
          endpoint: base.RATE_LIMIT_ENDPOINT,
        }
      : null,
    usageEstimator: base.USAGE_ESTIMATOR_ENDPOINT ? { endpoint: base.USAGE_ESTIMATOR_ENDPOINT } : null,
    billing: base.BILLING_ENDPOINT ? { endpoint: base.BILLING_ENDPOINT } : null,
    emails: base.EMAILS_ENDPOINT ? { endpoint: base.EMAILS_ENDPOINT } : null,
    webhooks: { endpoint: base.WEBHOOKS_ENDPOINT },
    schema: { endpoint: base.SCHEMA_ENDPOINT },
  },
  http: {
    port: base.PORT ?? 3001,
  },
  postgres: {
    host: postgres.POSTGRES_HOST,
    port: postgres.POSTGRES_PORT,
    db: postgres.POSTGRES_DB,
    user: postgres.POSTGRES_USER,
    password: postgres.POSTGRES_PASSWORD,
    ssl: postgres.POSTGRES_SSL === '1',
  },
  clickhouse: {
    protocol: clickhouse.CLICKHOUSE_PROTOCOL,
    host: clickhouse.CLICKHOUSE_HOST,
    port: clickhouse.CLICKHOUSE_PORT,
    username: clickhouse.CLICKHOUSE_USERNAME,
    password: clickhouse.CLICKHOUSE_PASSWORD,
  },
  redis: {
    host: redis.REDIS_HOST,
    port: redis.REDIS_PORT,
    password: redis.REDIS_PASSWORD ?? '',
  },
  supertokens: {
    connectionURI: supertokens.SUPERTOKENS_CONNECTION_URI,
    apiKey: supertokens.SUPERTOKENS_API_KEY,
  },
  github:
    github.INTEGRATION_GITHUB === '1'
      ? {
          appId: github.INTEGRATION_GITHUB_APP_ID,
          privateKey: github.INTEGRATION_GITHUB_APP_PRIVATE_KEY,
        }
      : null,
  cdn:
    cdn.CDN === '1'
      ? {
          baseUrl: cdn.CDN_BASE_URL,
          auth: {
            privateKey: cdn.CDN_AUTH_PRIVATE_KEY,
          },
          cloudflare: {
            basePath: cdn.CDN_CF_BASE_PATH,
            accountId: cdn.CDN_CF_ACCOUNT_ID,
            authToken: cdn.CDN_CF_AUTH_TOKEN,
            namespaceId: cdn.CDN_CF_NAMESPACE_ID,
          },
        }
      : null,
  legacyAuth0:
    authLegacyAuth0.AUTH_LEGACY_AUTH0 === '1'
      ? {
          apiKey: authLegacyAuth0.AUTH_LEGACY_AUTH0_INTERNAL_API_KEY,
        }
      : null,
  sentry: sentry.SENTRY === '1' ? { dsn: sentry.SENTRY_DSN } : null,
  prometheus:
    prometheus.PROMETHEUS_METRICS === '1'
      ? {
          labels: {
            instance: prometheus.PROMETHEUS_METRICS_LABEL_INSTANCE ?? 'server',
          },
        }
      : null,
  tracking: {
    key: base.TRACKING_KEY,
  },
  hive: hiveConfig,
} as const;
