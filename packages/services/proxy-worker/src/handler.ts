import { isSignatureValid } from './auth';
import { parseIncomingRequest } from './models';

/**
 * gatherResponse awaits and returns a response body as a string.
 */
async function gatherResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('json')) {
    return JSON.stringify(await response.json());
  } else if (contentType.includes('application/text')) {
    return response.text();
  } else if (contentType.startsWith('text/')) {
    return response.text();
  } else {
    return response.text();
  }
}

export async function handleRequest(request: Request, keyValidator: typeof isSignatureValid) {
  const parsedRequest = await parseIncomingRequest(request, keyValidator);

  if ('error' in parsedRequest) {
    return parsedRequest.error;
  }

  const init =
    parsedRequest.method === 'GET'
      ? {
          method: 'GET',
          headers: parsedRequest.headers,
        }
      : {
          method: 'POST',
          body: parsedRequest.body,
          headers: parsedRequest.headers,
        };
  const response = await fetch(parsedRequest.url, init);
  const text = await gatherResponse(response);
  return new Response(text, {
    ...init,
    status: response.status,
    statusText: response.statusText,
  });
}
