// @shop-plus/supply-consumer (SW-2) — the Shop+ consumer of Boutik+ supply
// read-models, transport B (HTTP pull; staleness blocks agreement). The value is
// the canon SupplyProjectionSchema, consumed verbatim; the envelope + freshness +
// identity-sweep are the SW-1↔SW-2 meeting point. Node/test tooling — never the
// RN app runtime graph (it parses through @platform/contracts).
export * from './read-model.js';
export * from './consumer.js';
export * from './mock.js';
export * from './opportunity.js';
