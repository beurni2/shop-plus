# COMPAT — a shop written by an OLD build must read under the NEW one

Born from the 2026-08-13 incident. The live storefront lost its en-têtes,
cover and articles after a deploy batch; the suspected mechanism — a canon
repin tightening a schema the service parses stored shops with — was
FALSIFIED with exactly this protocol, which exonerated the code and pointed
at the real cause (a Pages publish cancelled mid-flight).

The protocol simulates what production actually experiences on every deploy:
durable storage written by YESTERDAY'S worker, read by TODAY'S.

    # 1. at the OLD commit (what production currently runs):
    pnpm install && (cd packages/commerce-core && npx tsc -p tsconfig.json)
    (cd services/storefront-service && pnpm bundle:worker && pnpm bundle:worker:listing && pnpm bundle:worker:combined)
    node scripts/compat/seed-old.mjs /tmp/compat-persist

    # 2. at the NEW commit (what you are about to deploy):
    pnpm install && rebuild as above
    node scripts/compat/read-new.mjs /tmp/compat-persist

`read-new.mjs` must show the SAME headerStyle, cover, curatedItems and a
successful publish. Run it before any deploy that moves the canon pin
(`pnpm-workspace.yaml` overrides — the real pin) or touches
`services/storefront-service/src|worker`.

Not in CI on purpose: it needs two builds of two different commits, which CI
cannot express cheaply. It is a pre-deploy gate for the operator — and the
operator is the CTO agent, which is bound to run it by the JOURNAL's
2026-08-13 incident entry.

Note: the final `/checkout/quote` probe is commit-sensitive (request shapes
move) and is informational only — the GATE is the four storefront checks:
same headerStyle, same cover, same curatedItems, and a successful publish.
