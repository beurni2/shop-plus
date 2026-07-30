// NEGATIVE FIXTURE for the copy-lint-inline-refus gate — SP3.3b1.
// The §6.1 replay line is assembled at runtime from « {RESTE_A_PAYER} » — a part this
// gate never read and cannot lint. Only the placeholder allowlist ({X} {Y} {D})
// catches it; the sentence around it is impeccable French.
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
    phrase: 'Un prix ne reste affiché qu’un moment. Rien n’a été payé.',
    action: 'prix-a-jour',
    libelle: 'Voir le prix à jour',
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

export const PAIEMENT = {
  ligneMaintenant: 'À payer maintenant : {X}\u202fFCFA',
  ligneLivraison: 'À payer à la livraison : {Y}\u202fFCFA',
  titreA: 'Tout payer maintenant — recommandé',
  corpsA: 'Votre paiement est protégé auprès de notre partenaire de paiement jusqu’à la confirmation de votre livraison. Le vendeur n’est payé qu’après validation.',
  titreB: 'Payer le produit à la livraison',
  corpsB: 'Payez seulement les frais de livraison ({D}\u202fFCFA) maintenant. À l’arrivée du livreur, vérifiez votre article, puis payez le montant du produit de manière sécurisée avant de le recevoir.',
  corpsBAccent: 'avant de le recevoir',
  avertissementB: 'Frais de livraison non remboursables si vous annulez ou êtes absent(e).',
  redite: 'Vous payez {X}\u202fFCFA maintenant et {RESTE_A_PAYER} à la livraison — d’accord ?',
  rediteA: 'Vous payez {X}\u202fFCFA maintenant et {Y}\u202fFCFA à la livraison — d’accord ?',
  rediteFin: 'à la livraison — d’accord ?',
} as const;
