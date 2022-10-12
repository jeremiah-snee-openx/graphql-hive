import * as pulumi from '@pulumi/pulumi';
import { CloudflareProxy } from '../utils/cloudflare';
import { PackageHelper } from '../utils/pack';

const commonConfig = new pulumi.Config('common');
const cfConfig = new pulumi.Config('cloudflareCustom');

const commonEnv = commonConfig.requireObject<Record<string, string>>('env');

export type Proxy = ReturnType<typeof deployCFProxy>;

export function deployCFProxy({
  rootDns,
  envName,
  packageHelper,
}: {
  rootDns: string;
  envName: string;
  packageHelper: PackageHelper;
}) {
  const cfProxySignature = commonConfig.requireSecret('cfProxySignature');
  const proxy = new CloudflareProxy({
    envName,
    zoneId: cfConfig.require('zoneId'),
    // We can't cdn for staging env, since CF certificate only covers
    // one level of subdomains. See: https://community.cloudflare.com/t/ssl-handshake-error-cloudflare-proxy/175088
    // So for staging env, we are going to use `cdn-staging` instead of `cdn.staging`.
    cdnDnsRecord: envName === 'staging' ? `proxy-${rootDns}` : `proxy.${rootDns}`,
    secretSignature: cfProxySignature,
    sentryDsn: commonEnv.SENTRY_DSN,
    release: packageHelper.currentReleaseId(),
  });
  return proxy.deploy();
}
