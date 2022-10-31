import './dev-polyfill';
import { createServer } from 'http';
import { handleRequest } from './handler';
import { isSignatureValid } from './auth';
import { createServerAdapter } from '@whatwg-node/server';
import { Router } from 'itty-router';

// eslint-disable-next-line no-process-env
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;

function main() {
  const app = createServerAdapter(Router());

  app.get(
    '/_readiness',
    () =>
      new Response(null, {
        status: 200,
      })
  );

  app.all('*', (request: Request) => handleRequest(request, isSignatureValid));

  const server = createServer(app);

  return new Promise<void>(resolve => {
    server.listen(PORT, '0.0.0.0', resolve);
  });
}

main().catch(e => console.error(e));
