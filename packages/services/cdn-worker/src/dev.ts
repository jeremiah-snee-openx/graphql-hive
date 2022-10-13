import './dev-polyfill';
import { createServer } from 'http';
import { handleRequest } from './handler';
import { devStorage } from './dev-polyfill';
import { isKeyValid } from './auth';
import { createServerAdapter } from '@whatwg-node/server';
import { Router } from 'itty-router';
import { withParams, json } from 'itty-router-extras';

// eslint-disable-next-line no-process-env
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;

function main() {
  const app = createServerAdapter(Router());

  app.put(
    '/:accountId/storage/kv/namespaces/:namespaceId/values/:key',
    withParams,
    async (
      request: Request & {
        params: {
          accountId: string;
          namespaceId: string;
          key: string;
        };
      }
    ) => {
      if (!request.params.key) {
        throw new Error(`Missing key`);
      }

      const textBody = await request.text();

      if (!textBody) {
        throw new Error(`Missing body value`);
      }

      console.log(`Writing to ephermal storage: ${request.params.key}, value: ${textBody}`);

      devStorage.set(request.params.key, textBody);

      return json({
        success: true,
      });
    }
  );

  app.get('/dump', () => json(Object.fromEntries(devStorage.entries())));

  app.get(
    '/_readiness',
    () =>
      new Response(null, {
        status: 200,
      })
  );

  app.get('*', (request: Request) => handleRequest(request, isKeyValid));

  const server = createServer(app);

  return new Promise<void>(resolve => {
    server.listen(PORT, '0.0.0.0', resolve);
  });
}

main().catch(e => console.error(e));
