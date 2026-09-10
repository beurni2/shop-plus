// NEGATIVE FIXTURE for the copy-lint-inline-refus gate — SP3.3c.
// C6's POST-PAYMENT failure sentence carries MARKETING URGENCY — a word the raw
// scan cannot see, so only the CONFIRMATION extraction, linted as `money`, can
// catch it. Every other table is CLEAN: if the gate stops reading that table,
// this fixture goes green and C6's newest money sentences ship unlinted.
// Every table below is CLEAN and copied from the real screens.ts (F-59 rebuilt all of these
// negatives from one clean base): the ONLY thing that can fail this fixture is the defect
// named above. A negative that fails for the wrong reason proves nothing about its door.
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
  noteInjouable: 'La note ne se lance pas sur ce téléphone.',
} as const;

export function refusVue(reason: string) {
  return REFUS[reason] ?? REFUS_GENERIQUE;
}

// The §6.1 two-option checkout copy (SP3.3b1) — verbatim from the real screens.ts.
export const PAIEMENT = {
  ligneMaintenant: 'À payer maintenant\u00a0:\u00a0{X}\u202fFCFA',
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
  ecouterNote: 'Écouter la note de la vendeuse',
} as const;

// The door's copy (SP4.2b) — verbatim from the real screens.ts.
export const PORTE = {
  resteAPayer: 'Reste à payer, après inspection',
  echecTitre: 'Le paiement n’a pas abouti.',
  echecCorps: 'Rien n’a été confirmé. Votre commande est toujours là — vous pouvez réessayer.',
  echecAction: 'Réessayer le paiement',
} as const;

// The operator wait screens (OPERATEUR-VRAI-1, F-60) — verbatim from the real screens.ts.
export const OPERATEUR = {
  titre: 'Confirmez sur votre téléphone',
  corps: 'Votre opérateur vous demande votre code secret pour valider {X}.',
  cle: 'code secret',
  attente: 'En attente de la confirmation de l’opérateur…',
  loi: 'Rien n’est confirmé tant que l’opérateur n’a pas répondu. Nous ne dirons\u00a0jamais\u00a0le\u00a0contraire.',
  porteTitre: 'Payez le reste, en sécurité',
  porteLoi: 'Le livreur ne peut pas dire « payé » à votre place. Seul l’opérateur confirme.',
} as const;

// C6's post-payment copy (SP3.3c) — verbatim from the real screens.ts.
export const CONFIRMATION = {
  attenteTitre: 'Nous attendons l’opérateur.',
  attenteCorps: 'Votre commande est bien enregistrée. Nous dirons « payé » seulement quand l’opérateur l’aura confirmé.',
  attenteChip: 'EN ATTENTE DE L’OPÉRATEUR',
  attenteAction: 'Vérifier à nouveau',
  attenteHorsPortee: 'Nous n’arrivons pas à joindre le service pour l’instant. Votre commande est bien là.',
  echecTitre: 'Le paiement n’a pas abouti.',
  echecCorps: 'Dépêchez-vous de réessayer, dernière chance : rien n’a été confirmé.',
  echecAction: 'Réessayer le paiement',
  reference: 'Numéro de commande',
  etapeSuivre: 'Vous suivez chaque étape sur cette page.',
} as const;

// C3's voice-control labels — verbatim from the real screens.ts.
export const VOIX = {
  ecouter: 'Écouter',
  pause: 'Pause',
  titre: 'Note vocale',
  ecouterProduit: 'Écouter la note vocale',
} as const;

// The tracking's copy (VRAI-SUIVI) — verbatim from the real screens.ts.
export const SUIVI = {
  etape1Titre: 'Commande enregistrée',
  etape1Corps: 'Nous avons bien reçu votre commande.',
  etape2Titre: 'Préparée par la vendeuse',
  etape2Corps: 'La vendeuse prépare votre colis.',
  etape3Titre: 'Prête chez la vendeuse',
  etape3Corps: 'Le colis attend le livreur Séra.',
  etape4Titre: 'En route',
  etape4Corps: 'Le colis est en chemin vers votre repère.',
  etape5Titre: 'À votre porte',
  etape5Corps: 'Inspectez avant d’accepter.',
  etape6Titre: 'Remise',
  etape6Corps: 'Votre code fait foi.',
  intro: 'Revenez ici quand vous voulez : cette page se met à jour.',
  gps: 'Pas de point GPS — des étapes claires, que vous suivez ici.',
  verifier: 'Vérifier à nouveau',
  horsPortee: 'Nous n’arrivons pas à joindre le service pour l’instant. Votre commande est bien là.',
  voirCode: 'Voir mon code',
  terminee: 'C’est terminé',
  reentree: 'Ma commande',
  c9Attente: 'Votre code apparaîtra ici quand le livreur sera à votre porte. Jamais avant.',
  c9Arrivee: 'Le livreur est là. Votre code arrive dans un instant.',
  codeDemo: 'Code de démonstration',
  merciTitre: 'Merci !',
  merciCorps: 'Votre commande est livrée. Nous espérons qu’elle vous plaît.',
  merciPreuve: 'La preuve de votre livraison est gardée.',
  merciFermer: 'Terminer',
} as const;

// C10's WhatsApp gift message (F-59) — verbatim from the real screens.ts.
export const MERCI = {
  titreAvant: 'Prévenez',
  corps: 'Votre message partira de votre WhatsApp, avec le lien pour suivre la livraison.',
  prenomLabel: 'Votre prénom',
  prenomManque: 'Dites-nous votre prénom.',
  action: 'Prévenir sur WhatsApp',
  message: 'C’est {prenom} — je viens de t’offrir « {article} » de ta liste d’envies. Tu peux suivre la livraison ici : {lien}',
} as const;

// The §6.2 inspection matrix (F-59) — verbatim from the real screens.ts.
export const INSPECTION_PRUDENTE: RangeeInspection = {
  verifier: ['C’est le bon article — celui de la photo', 'En bon état', 'Rien ne manque'],
  motifs: ['Ce n’est pas le bon article', 'Il est abîmé', 'Il manque quelque chose'],
  risque: 'Vous ne pouvez pas l’essayer à la porte.',
};

export const INSPECTION: Readonly<Record<string, RangeeInspection>> = {
  fashion_bags_fabrics: {
    verifier: [
      'C’est le bon article — celui de la photo',
      'La bonne couleur',
      'La bonne taille sur l’étiquette',
      'Le bon nombre',
      'En bon état, rien ne manque',
    ],
    motifs: ['Ce n’est pas le bon article', 'Ce n’est pas la bonne couleur', 'Il est abîmé', 'Il en manque'],
    risque: 'Vous ne pouvez pas l’essayer à la porte. La coupe qui ne vous plaît pas ne compte pas comme un problème.',
  },
  shoes: {
    verifier: [
      'Ouvrez la boîte',
      'C’est le bon modèle',
      'La bonne pointure sur l’étiquette',
      'Les deux pieds sont là',
      'En bon état',
    ],
    motifs: ['Ce n’est pas le bon modèle', 'Ce n’est pas la bonne pointure', 'Il est abîmé', 'Il manque une chaussure'],
    risque: 'Si vous les portez, elles sont à vous. La pointure qui serre ne compte pas comme un problème.',
  },
  sealed_beauty_cosmetics: {
    verifier: [
      'Regardez l’emballage, sans l’ouvrir',
      'Le scellé du fabricant est intact',
      'Le bon nom et la bonne teinte',
      'Le bon nombre',
      'La date n’est pas dépassée',
    ],
    motifs: ['Le scellé est cassé', 'Ce n’est pas la bonne teinte', 'La date est dépassée', 'Il est abîmé'],
    risque: 'N’ouvrez pas le scellé avant d’accepter. Un scellé ouvert par vous ne compte pas comme un problème.',
  },
};
