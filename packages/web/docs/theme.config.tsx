/* eslint sort-keys: error */
import { defineConfig, HiveLogo } from '@theguild/components';

const siteName = 'GraphQL Hive';

export default defineConfig({
  docsRepositoryBase: 'https://github.com/kamilkisiela/graphql-hive/tree/main/packages/web/docs',
  logo: (
    <>
      <HiveLogo className="mr-1.5 h-9 w-9" />
      <div>
        <h1 className="md:text-md text-sm font-medium">{siteName}</h1>
        <h2 className="hidden text-xs sm:block">Documentation</h2>
      </div>
    </>
  ),
  siteName,
  chat: {
    icon: null
  }
});
