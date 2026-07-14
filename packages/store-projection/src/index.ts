// @shop-plus/store-projection — THE ONE store-directory producer (SP#001-B).
// A pure fold from the storefront + listing event stream to the store
// projection, consumed by BOTH the buyer PWA directory and the
// discovery-service. Dependency-free; canon shapes are never redefined here.
export * from './store-projection.js';
export * from './reputation.js';
