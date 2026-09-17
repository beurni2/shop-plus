// NEGATIVE FIXTURE — no-cross-reseller-discovery (SP-I05 amended 2026-09-17).
// A store directory with a search across resellers: exactly what Shop+ must
// never grow on a buyer surface. Every line below must be caught.
export interface StoreIndex { stores: { slug: string; name: string }[] } // banned
export const boutiquesAnnuaire: StoreIndex = { stores: [] }; // banned
export function searchStores(q: string): StoreIndex { return { stores: [] }; } // banned
export function rechercherBoutiques(q: string): string[] { return []; } // banned
export const titre = 'Rechercher une boutique'; // banned
export const sousTitre = 'Toutes les boutiques près de vous'; // banned
export const lever = '?demo-boutiques=default'; // banned
export const producteur = 'projectStores'; // banned — the whole-directory projection
export const service = 'discovery-service'; // banned — the retired stub
