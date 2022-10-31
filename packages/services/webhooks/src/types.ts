import type { FastifyLoggerInstance } from '@hive/service-common';
import type { Job } from 'bullmq';
import type { WebhookInput } from './scheduler';

export interface Config {
  logger: FastifyLoggerInstance;
  redis: {
    host: string;
    port: number;
    password: string;
  };
  webhookQueueName: string;
  maxAttempts: number;
  backoffDelay: number;
  requestProxy: null | {
    endpoint: string;
    signature: string;
  };
}

export interface Context {
  logger: FastifyLoggerInstance;
  errorHandler(message: string, error: Error, logger?: FastifyLoggerInstance | undefined): void;
  schedule(webhook: WebhookInput): Promise<Job<any, any, string>>;
}
