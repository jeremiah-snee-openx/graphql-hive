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
  ENCRYPTION_SECRET: zod.string(),
});

const RequestProxyModel = zod.union([
  zod.object({
    REQUEST_PROXY: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    REQUEST_PROXY: zod.literal('1'),
    REQUEST_PROXY_ENDPOINT: zod.string().min(1),
    REQUEST_PROXY_SIGNATURE: zod.string().min(1),
  }),
]);

const SentryModel = zod.union([
  zod.object({
    SENTRY: emptyString(zod.literal('0').optional()),
  }),
  zod.object({
    SENTRY: zod.literal('1'),
    SENTRY_DSN: zod.string(),
  }),
]);

const RedisModel = zod.object({
  REDIS_HOST: zod.string(),
  REDIS_PORT: NumberFromString,
  REDIS_PASSWORD: emptyString(zod.string().optional()),
});

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
  redis: RedisModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  prometheus: PrometheusModel.safeParse(process.env),
  // eslint-disable-next-line no-process-env
  requestProxy: RequestProxyModel.safeParse(process.env),
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
const sentry = extractConfig(configs.sentry);
const redis = extractConfig(configs.redis);
const prometheus = extractConfig(configs.prometheus);
const requestProxy = extractConfig(configs.requestProxy);

export const env = {
  environment: base.ENVIRONMENT,
  release: base.RELEASE ?? 'local',
  encryptionSecret: base.ENCRYPTION_SECRET,
  http: {
    port: base.PORT ?? 6500,
  },
  redis: {
    host: redis.REDIS_HOST,
    port: redis.REDIS_PORT,
    password: redis.REDIS_PASSWORD ?? '',
  },
  sentry: sentry.SENTRY === '1' ? { dsn: sentry.SENTRY_DSN } : null,
  prometheus:
    prometheus.PROMETHEUS_METRICS === '1'
      ? {
          labels: {
            instance: prometheus.PROMETHEUS_METRICS_LABEL_INSTANCE ?? 'schema',
          },
        }
      : null,
  requestProxy:
    requestProxy.REQUEST_PROXY === '1'
      ? {
          endpoint: requestProxy.REQUEST_PROXY_ENDPOINT,
          signature: requestProxy.REQUEST_PROXY_SIGNATURE,
        }
      : null,
} as const;
