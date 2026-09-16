# Golden fixture repo

A tiny, deliberately unrelated set of files used only by the integration
tests in `apps/api/test/` (golden-set retrieval, e2e happy path). Every
source file covers one distinct topic on purpose - if you extend this repo,
keep new files just as unrelated to the existing ones, or the recall
assertions in `golden-retrieval.e2e-spec.ts` get less reliable.
