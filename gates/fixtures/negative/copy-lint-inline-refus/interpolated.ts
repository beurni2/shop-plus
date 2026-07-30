// NEGATIVE FIXTURE for the copy-lint-inline-refus gate.
// An INTERPOLATED template literal in a money sentence. The gate refuses it
// outright: a sentence assembled at runtime cannot be linted as read.
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
    phrase: `Le prix ${'' + 'a changé'} — réessayez.`,
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

// A CLEAN §6.1 PAIEMENT block (SP3.3b1) — verbatim from the real screens.ts.
// It is here so this fixture keeps failing for ITS OWN planted defect and not
// merely for a missing table: a negative that fails for the wrong reason proves
// nothing about the check it is named after.
export const PAIEMENT = {
  ligneMaintenant: 'À payer maintenant : {X}\u202fFCFA',
  ligneLivraison: 'À payer à la livraison : {Y}\u202fFCFA',
  titreA: 'Tout payer maintenant — recommandé',
  corpsA: 'Votre paiement est protégé auprès de notre partenaire de paiement jusqu’à la confirmation de votre livraison. Le vendeur n’est payé qu’après validation.',
  titreB: 'Payer le produit à la livraison',
  corpsB: 'Payez seulement les frais de livraison ({D}\u202fFCFA) maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le montant du produit de manière sécurisée avant de le recevoir.',
  corpsBAccent: 'avant de le recevoir',
  avertissementB: 'Frais de livraison non remboursables si vous annulez ou êtes absent(e).',
  redite: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  rediteA: 'Vous payez {X}\u202fFCFA maintenant, et rien à la livraison — d’accord ?',
} as const;
