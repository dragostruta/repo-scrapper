import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidSignatureError extends Error {}

/**
 * Verifies that an inbound webhook payload really came from the provider, by
 * recomputing its HMAC-SHA256 signature with the shared signing secret and
 * comparing the two in constant time. This has nothing to do with user
 * sessions - it authenticates a machine-to-machine request body, not a person.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headerSignature: string,
  signingSecret: string,
): void {
  const expected = createHmac('sha256', signingSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(headerSignature, 'hex');

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidSignatureError('Webhook signature does not match the request body');
  }
}
