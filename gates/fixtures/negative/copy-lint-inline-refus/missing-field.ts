// NEGATIVE FIXTURE for the copy-lint-inline-refus gate.
// A refusal view with its `phrase` DELETED. The old hand-typed MIN_ENTRIES of
// 20 against 35 real strings could not notice; the structural floor must.
const REFUS_GENERIQUE = {
  overline: 'LE PRIX',
  titre: 'Nous ne pouvons pas afficher le prix.',
  phrase: 'Réessayez dans un instant. Rien n’a été payé.',
  action: 'reessayer-prix',
  libelle: 'Réessayer',
};

const REFUS = {
  expired: {
    overline: 'LE PRIX',
    titre: 'Ce prix a expiré.',
    action: 'prix-a-jour',
    libelle: 'Voir le prix à jour',
  },
  filler_1: {
    overline: 'LE PRIX 1',
    titre: 'Nous ne pouvons pas afficher le prix 1.',
    phrase: 'Réessayez dans un instant. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer 1',
  },
  filler_2: {
    overline: 'LE PRIX 2',
    titre: 'Nous ne pouvons pas afficher le prix 2.',
    phrase: 'Réessayez dans un instant. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer 2',
  },
  filler_3: {
    overline: 'LE PRIX 3',
    titre: 'Nous ne pouvons pas afficher le prix 3.',
    phrase: 'Réessayez dans un instant. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer 3',
  },
  filler_4: {
    overline: 'LE PRIX 4',
    titre: 'Nous ne pouvons pas afficher le prix 4.',
    phrase: 'Réessayez dans un instant. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer 4',
  },
  filler_5: {
    overline: 'LE PRIX 5',
    titre: 'Nous ne pouvons pas afficher le prix 5.',
    phrase: 'Réessayez dans un instant. Rien n’a été payé.',
    action: 'reessayer-prix',
    libelle: 'Réessayer 5',
  },
  unreachable: {
    overline: 'HORS LIGNE',
    titre: 'Pas de connexion.',
    phrase: 'Le prix ne peut pas être affiché sans réseau.',
    action: 'reessayer-prix',
    libelle: 'Réessayer',
  },
};

export const MESSAGES = {
  prixRafraichiIdentique: 'Nouveau prix demandé. Le montant n’a pas changé.',
  prixRafraichiDifferent: 'Le prix a été mis à jour. Nouveau total :',
  prixEnCoursDeMiseAJour: 'Nous demandons un nouveau prix…',
} as const;

export function refusVue(reason: string) {
  return REFUS[reason] ?? REFUS_GENERIQUE;
}
