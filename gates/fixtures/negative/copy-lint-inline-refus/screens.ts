// NEGATIVE FIXTURE for the copy-lint-inline-refus gate — a REFUS table shaped
// exactly like the real one, carrying the French Voice violations the gate must
// catch on a buyer's refusal screen:
//   · « veuillez » — banned administrative register (§10.5 condition a)
//   · « séquestre » — the canonically forbidden word
//   · « profitez » — marketing/urgency inside a register:money string (cond. b)
//   · a sentence far over the 18-word status budget (condition c)
const REFUS_GENERIQUE = {
  overline: 'LE PRIX',
  titre: 'Veuillez patienter.',
  phrase: 'Profitez de nos offres pendant que votre argent reste en séquestre.',
  action: 'reessayer-prix',
  libelle: 'Réessayer',
};

const REFUS = {
  expired: {
    overline: 'LE PRIX',
    titre: 'Nonobstant ce qui précède, le prix susmentionné a expiré.',
    phrase: 'Conformément à nos conditions générales de vente applicables, il vous appartient de solliciter préalablement une nouvelle cotation tarifaire auprès de nos services compétents.',
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

export function refusVue(reason: string) {
  return REFUS[reason] ?? REFUS_GENERIQUE;
}
