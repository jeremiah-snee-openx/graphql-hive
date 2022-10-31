export {};

declare global {
  /**
   * Signature used to verify the origin of the request
   */
  let SIGNATURE: string;
  let SENTRY_DSN: string;
  /**
   * Name of the environment, e.g. staging, production
   */
  let SENTRY_ENVIRONMENT: string;
  /**
   * Id of the release
   */
  let SENTRY_RELEASE: string;
}
