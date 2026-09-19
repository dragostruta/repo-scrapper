# Golden fixture repo

A small, deliberately varied set of files used only by the integration tests
in `apps/api/test/` (golden-set retrieval, e2e happy path).

Two things matter if you extend it:

- **Keep topics distinct.** Each file covers one subject, so a question has
  exactly one right answer file.
- **Keep the deliberate near-misses.** Some pairs exist to be confusable and
  are what make the recall numbers mean anything:
  `auth.ts` (verifying a person's password) against `webhook-verify.ts`
  (verifying a machine's HMAC signature), and `http-client.ts` (retrying a
  network request) against `job-queue.py` (retrying a background job). A
  retriever that cannot tell those apart still scores well on an easy set.
