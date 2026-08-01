// NEGATIVE FIXTURE for the copy-lint-inline-refus gate.
// A view whose FIELD KEY is quoted — same silent-skip family as the quoted
// view key, one level down.
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
    'titre': 'Veuillez patienter, nonobstant ce qui précède.',
    phrase: 'Un prix ne reste affiché qu’un moment. Rien n’a été payé.',
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
  titreBFin: 'à la livraison',
  corpsB: 'Payez seulement les frais de livraison ({D}\u202fFCFA) maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le montant du produit de manière sécurisée avant de le recevoir.',
  corpsBAccent: 'avant de le recevoir',
  avertissementB: 'Frais de livraison non remboursables si vous annulez ou êtes absent(e).',
  redite: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  rediteA: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  rediteFin: 'à la livraison — d’accord ?',
} as const;


// A CLEAN C6 CONFIRMATION block (SP3.3c) — verbatim from the real screens.ts,
// for the reason the PAIEMENT block above is here: this fixture must keep
// failing for ITS OWN planted defect, not for a table it never had.
export const CONFIRMATION = {
  attenteTitre: 'Nous attendons l’opérateur.',
  attenteCorps: 'Votre commande est bien enregistrée. Nous dirons « payé » seulement quand l’opérateur l’aura confirmé.',
  attenteChip: 'EN ATTENTE DE L’OPÉRATEUR',
  attenteAction: 'Vérifier à nouveau',
  attenteHorsPortee: 'Nous n’arrivons pas à joindre le service pour l’instant. Votre commande est bien là.',
  echecTitre: 'Le paiement n’a pas abouti.',
  echecCorps: 'Rien n’a été confirmé. Votre commande vous attend — vous pouvez réessayer.',
  echecAction: 'Réessayer le paiement',
} as const;
