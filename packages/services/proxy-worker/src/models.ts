import { z } from 'zod';
import { isSignatureValid } from './auth';
import { MissingSignature, InvalidSignature, InvalidRequestFormat } from './errors';

const SIGNATURE_HEADER_NAME = 'x-hive-signature';

const RequestModelSchema = z.union([
  z.object({
    method: z.literal('GET'),
    url: z.string().min(1),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    method: z.literal('POST'),
    url: z.string().min(1),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
]);

export async function parseIncomingRequest(
  request: Request,
  keyValidator: typeof isSignatureValid
): Promise<{ error: Response } | z.infer<typeof RequestModelSchema>> {
  if (request.method !== 'POST') {
    return {
      error: new Response('Only POST requests are allowed', {
        status: 405,
        statusText: 'Method Not Allowed',
      }),
    };
  }

  const signature = request.headers.get(SIGNATURE_HEADER_NAME);

  if (!signature) {
    return {
      error: new MissingSignature(),
    };
  }

  if (!keyValidator(signature)) {
    return {
      error: new InvalidSignature(),
    };
  }

  const parseResult = RequestModelSchema.safeParse(await request.json<unknown>());

  if (!parseResult.success) {
    return { error: new InvalidRequestFormat(parseResult.error.message) };
  }

  return parseResult.data;
}
