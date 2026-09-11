// Romaintalk TCF mock exam — Série d'entraînement n°1 (original content).
// Format mirrors the official TCF tout public training structure:
//   Q1–15  Compréhension orale   (Q1–3: question + 4 spoken replies; Q4–15: document + spoken question, written choices)
//   Q16–25 Structure de la langue
//   Q26–40 Compréhension écrite
// Difficulty ramps from A1 to C1 inside each section, as in the real test.

export type TcfSection = "oral" | "structure" | "ecrit";
export type TcfLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type TcfLetter = "A" | "B" | "C" | "D";
export type TcfSpeaker = "narratrice" | "femme" | "homme" | "femme2" | "homme2";

export interface TcfAudioSegment {
  speaker: TcfSpeaker;
  text: string;
}

export interface TcfMockItem {
  n: number;
  section: TcfSection;
  level: TcfLevel;
  /** Listening only: the script, in order. The transcript is built from it. */
  audio?: TcfAudioSegment[];
  /** Listening Q1–3: the four replies are spoken, not written. */
  spokenChoices?: boolean;
  /** Reading only: the written document. */
  passage?: string;
  /** Written question (structure: the gapped sentence; reading: the question about the passage). */
  question?: string;
  choices: [string, string, string, string];
  answer: TcfLetter;
  /** Short human-written key point. The AI button gives a fuller explanation. */
  note: string;
}

export interface TcfMockExam {
  id: string;
  title: string;
  items: TcfMockItem[];
}

const items: TcfMockItem[] = [
  // ───────────── COMPRÉHENSION ORALE ─────────────
  {
    n: 1,
    section: "oral",
    level: "A1",
    spokenChoices: true,
    audio: [
      { speaker: "femme", text: "Bonjour, vous avez un rendez-vous ?" },
      { speaker: "narratrice", text: "Réponse A." },
      { speaker: "homme", text: "Oui, à dix heures avec le docteur Martin." },
      { speaker: "narratrice", text: "Réponse B." },
      { speaker: "homme", text: "Non merci, je n'ai pas faim." },
      { speaker: "narratrice", text: "Réponse C." },
      { speaker: "homme", text: "Il fait très beau aujourd'hui." },
      { speaker: "narratrice", text: "Réponse D." },
      { speaker: "homme", text: "J'habite près de la gare." },
    ],
    choices: [
      "Oui, à dix heures avec le docteur Martin.",
      "Non merci, je n'ai pas faim.",
      "Il fait très beau aujourd'hui.",
      "J'habite près de la gare.",
    ],
    answer: "A",
    note: "La question porte sur un rendez-vous ; seule la réponse A parle d'une heure et d'un médecin.",
  },
  {
    n: 2,
    section: "oral",
    level: "A1",
    spokenChoices: true,
    audio: [
      { speaker: "homme", text: "Excusez-moi, la bibliothèque ferme à quelle heure ?" },
      { speaker: "narratrice", text: "Réponse A." },
      { speaker: "femme", text: "Elle est au deuxième étage." },
      { speaker: "narratrice", text: "Réponse B." },
      { speaker: "femme", text: "À dix-huit heures, monsieur." },
      { speaker: "narratrice", text: "Réponse C." },
      { speaker: "femme", text: "Oui, j'aime beaucoup lire." },
      { speaker: "narratrice", text: "Réponse D." },
      { speaker: "femme", text: "Les livres sont gratuits." },
    ],
    choices: [
      "Elle est au deuxième étage.",
      "À dix-huit heures, monsieur.",
      "Oui, j'aime beaucoup lire.",
      "Les livres sont gratuits.",
    ],
    answer: "B",
    note: "« À quelle heure » appelle une heure : dix-huit heures.",
  },
  {
    n: 3,
    section: "oral",
    level: "A2",
    spokenChoices: true,
    audio: [
      { speaker: "femme", text: "Tu viens avec nous au cinéma samedi soir ?" },
      { speaker: "narratrice", text: "Réponse A." },
      { speaker: "homme", text: "Le film a duré deux heures." },
      { speaker: "narratrice", text: "Réponse B." },
      { speaker: "homme", text: "Je suis allé au cinéma hier." },
      { speaker: "narratrice", text: "Réponse C." },
      { speaker: "homme", text: "Avec plaisir, à quelle heure on se retrouve ?" },
      { speaker: "narratrice", text: "Réponse D." },
      { speaker: "homme", text: "Le cinéma est fermé le lundi." },
    ],
    choices: [
      "Le film a duré deux heures.",
      "Je suis allé au cinéma hier.",
      "Avec plaisir, à quelle heure on se retrouve ?",
      "Le cinéma est fermé le lundi.",
    ],
    answer: "C",
    note: "C'est une invitation ; la seule réponse qui accepte ou refuse l'invitation est la C.",
  },
  {
    n: 4,
    section: "oral",
    level: "A2",
    audio: [
      {
        speaker: "narratrice",
        text: "Mesdames et messieurs, le train numéro 6 4 2 1 à destination de Lyon Part-Dieu, départ initialement prévu à quatorze heures dix, partira avec un retard d'environ vingt minutes. Nous vous prions de nous excuser pour la gêne occasionnée.",
      },
      { speaker: "narratrice", text: "Que se passe-t-il avec le train pour Lyon ?" },
    ],
    choices: [
      "Il est annulé.",
      "Il part en avance.",
      "Il part en retard.",
      "Il change de quai.",
    ],
    answer: "C",
    note: "« Un retard d'environ vingt minutes » : le train part plus tard que prévu.",
  },
  {
    n: 5,
    section: "oral",
    level: "A2",
    audio: [
      { speaker: "homme", text: "Bonjour, je voudrais réserver une table pour ce soir." },
      { speaker: "femme", text: "Bien sûr. Pour combien de personnes ?" },
      { speaker: "homme", text: "Nous serons quatre, vers vingt heures." },
      { speaker: "femme", text: "Vingt heures, c'est complet. Je peux vous proposer dix-neuf heures trente ou vingt et une heures." },
      { speaker: "homme", text: "Vingt et une heures, c'est un peu tard. On prend dix-neuf heures trente." },
      { speaker: "narratrice", text: "À quelle heure le client réserve-t-il ?" },
    ],
    choices: ["À dix-neuf heures trente.", "À vingt heures.", "À vingt et une heures.", "À vingt et une heures trente."],
    answer: "A",
    note: "Le client refuse vingt et une heures (« trop tard ») et accepte dix-neuf heures trente.",
  },
  {
    n: 6,
    section: "oral",
    level: "B1",
    audio: [
      { speaker: "femme", text: "Allô, Karim ? C'est Léa. Je t'appelle parce que la réunion de demain est déplacée." },
      { speaker: "homme", text: "Ah bon ? Elle est annulée ?" },
      { speaker: "femme", text: "Non, non, elle a bien lieu, mais pas à neuf heures : la directrice ne peut pas avant l'après-midi. Ce sera à quinze heures, en salle B au lieu de la salle A." },
      { speaker: "homme", text: "D'accord. Et je dois toujours préparer la présentation des chiffres ?" },
      { speaker: "femme", text: "Oui, ça ne change pas. Par contre, elle a demandé une version plus courte, dix minutes maximum." },
      { speaker: "narratrice", text: "Qu'est-ce qui ne change pas pour la réunion de demain ?" },
    ],
    choices: ["L'heure.", "La salle.", "Le sujet de la présentation de Karim.", "La durée de la présentation."],
    answer: "C",
    note: "L'heure, la salle et la durée changent ; Karim doit « toujours préparer la présentation des chiffres ».",
  },
  {
    n: 7,
    section: "oral",
    level: "B1",
    audio: [
      {
        speaker: "homme",
        text: "Vous écoutez la météo. Après un week-end très ensoleillé sur l'ensemble du pays, le temps se dégrade dès lundi matin par l'ouest. Des pluies parfois fortes toucheront la Bretagne et la Normandie avant de gagner Paris en fin de journée. Les températures restent douces pour la saison, autour de dix-huit degrés. Retour du soleil prévu mercredi.",
      },
      { speaker: "narratrice", text: "Quel temps fera-t-il à Paris lundi soir ?" },
    ],
    choices: ["Il y aura du soleil.", "Il pleuvra.", "Il neigera.", "Il fera très froid."],
    answer: "B",
    note: "Les pluies « gagnent Paris en fin de journée » lundi. Le soleil ne revient que mercredi.",
  },
  {
    n: 8,
    section: "oral",
    level: "B1",
    audio: [
      { speaker: "femme", text: "Bonjour, j'ai acheté ce grille-pain chez vous la semaine dernière et il ne fonctionne plus." },
      { speaker: "homme", text: "Vous avez le ticket de caisse ?" },
      { speaker: "femme", text: "Oui, le voici. Je préférerais un remboursement, si c'est possible." },
      { speaker: "homme", text: "Malheureusement, pour les appareils électriques, nous ne remboursons pas. Je peux vous l'échanger contre le même modèle, ou vous faire un avoir valable un an dans le magasin." },
      { speaker: "femme", text: "Le même modèle, non merci. Je vais prendre l'avoir, je reviendrai choisir autre chose." },
      { speaker: "narratrice", text: "Que choisit finalement la cliente ?" },
    ],
    choices: ["Un remboursement.", "Un échange contre le même grille-pain.", "Un avoir pour le magasin.", "Une réparation de l'appareil."],
    answer: "C",
    note: "Le remboursement est refusé, la cliente refuse l'échange et « prend l'avoir ».",
  },
  {
    n: 9,
    section: "oral",
    level: "B2",
    audio: [
      {
        speaker: "femme",
        text: "Selon une enquête publiée ce matin, près d'un salarié sur trois en France télétravaille au moins un jour par semaine, contre un sur vingt avant 2020. Mais cette progression cache de fortes inégalités : le télétravail concerne surtout les cadres des grandes villes, tandis que les ouvriers et les employés du commerce en restent presque totalement exclus. Les auteurs de l'étude soulignent par ailleurs que les entreprises commencent à réduire le nombre de jours autorisés, souvent de trois à deux.",
      },
      { speaker: "narratrice", text: "Quelle tendance récente l'étude relève-t-elle ?" },
    ],
    choices: [
      "Le télétravail progresse chez les ouvriers.",
      "Les entreprises limitent les jours de télétravail.",
      "Un salarié sur vingt télétravaille aujourd'hui.",
      "Le télétravail a disparu dans les grandes villes.",
    ],
    answer: "B",
    note: "« Les entreprises commencent à réduire le nombre de jours autorisés, souvent de trois à deux. »",
  },
  {
    n: 10,
    section: "oral",
    level: "B2",
    audio: [
      { speaker: "homme", text: "Tu as vu ? La mairie veut fermer la piscine du quartier pour construire des logements." },
      { speaker: "femme", text: "Oui, j'ai lu ça. Franchement, je comprends qu'on manque de logements, mais cette piscine, c'est le seul endroit où les enfants apprennent à nager gratuitement." },
      { speaker: "homme", text: "Ils disent qu'une nouvelle piscine ouvrira dans trois ans, à l'autre bout de la ville." },
      { speaker: "femme", text: "Trois ans ! Et à quarante minutes de bus. Ce n'est pas une solution, c'est une excuse. Je vais signer la pétition." },
      { speaker: "narratrice", text: "Quelle est l'attitude de la femme ?" },
    ],
    choices: [
      "Elle approuve totalement le projet de la mairie.",
      "Elle est indifférente à la fermeture.",
      "Elle s'oppose au projet malgré le manque de logements.",
      "Elle propose de construire la piscine ailleurs.",
    ],
    answer: "C",
    note: "Elle reconnaît le manque de logements (« je comprends ») mais refuse la fermeture et signe la pétition.",
  },
  {
    n: 11,
    section: "oral",
    level: "B2",
    audio: [
      {
        speaker: "homme",
        text: "Chronique économie. Le prix du café a doublé en deux ans sur les marchés mondiaux, et cette hausse arrive maintenant dans nos tasses. En cause : des récoltes catastrophiques au Brésil et au Vietnam, les deux premiers producteurs, frappés tour à tour par la sécheresse puis par des pluies excessives. Les torréfacteurs français ont d'abord absorbé la hausse, mais ils annoncent désormais des augmentations de dix à quinze pour cent en rayon. Certains misent sur des mélanges avec des variétés moins chères pour limiter l'impact.",
      },
      { speaker: "narratrice", text: "Comment certains torréfacteurs réagissent-ils à la hausse des prix ?" },
    ],
    choices: [
      "Ils arrêtent d'importer du café brésilien.",
      "Ils changent la composition de leurs mélanges.",
      "Ils baissent leurs prix de quinze pour cent.",
      "Ils attendent la prochaine récolte sans rien changer.",
    ],
    answer: "B",
    note: "« Certains misent sur des mélanges avec des variétés moins chères. »",
  },
  {
    n: 12,
    section: "oral",
    level: "C1",
    audio: [
      {
        speaker: "femme",
        text: "On nous répète que la lecture recule chez les jeunes. Les chiffres sont têtus : le temps consacré aux livres a été divisé par deux en vingt ans chez les quinze-vingt-quatre ans. Pourtant, à y regarder de plus près, le constat mérite d'être nuancé. Jamais les jeunes n'ont autant lu, mais ils lisent autrement : des messages, des articles, des récits en ligne parfois très longs. Ce qui recule, ce n'est pas la lecture, c'est une certaine forme de lecture, lente et solitaire, que l'école continue de valoriser comme si elle était la seule légitime.",
      },
      { speaker: "narratrice", text: "Quelle est la thèse défendue par la chroniqueuse ?" },
    ],
    choices: [
      "Les jeunes ne lisent plus du tout.",
      "La lecture change de forme plutôt qu'elle ne disparaît.",
      "L'école doit interdire la lecture sur écran.",
      "Les chiffres sur la lecture sont faux.",
    ],
    answer: "B",
    note: "« Ce qui recule, ce n'est pas la lecture, c'est une certaine forme de lecture. » Les chiffres ne sont pas contestés, ils sont nuancés.",
  },
  {
    n: 13,
    section: "oral",
    level: "C1",
    audio: [
      { speaker: "homme", text: "Madame Roux, votre entreprise a décidé de relocaliser sa production en France. Un choix économique ou un choix d'image ?" },
      { speaker: "femme", text: "Les deux, je ne vais pas le nier. Mais le déclencheur, ça a été la crise logistique : quand vos conteneurs restent bloqués six semaines, la main-d'œuvre moins chère ne compense plus rien. Produire ici nous coûte environ douze pour cent de plus, mais nous livrons en trois jours au lieu de six semaines, et nous n'avons plus de stocks morts. Au final, la marge est comparable." },
      { speaker: "narratrice", text: "Quel a été l'élément déterminant dans la décision de relocaliser ?" },
    ],
    choices: [
      "La baisse du coût de la main-d'œuvre en France.",
      "Les problèmes de transport des marchandises.",
      "Une demande des clients.",
      "Une aide financière de l'État.",
    ],
    answer: "B",
    note: "« Le déclencheur, ça a été la crise logistique » : les conteneurs bloqués.",
  },
  {
    n: 14,
    section: "oral",
    level: "C1",
    audio: [
      {
        speaker: "homme",
        text: "Le tribunal administratif a suspendu hier l'arrêté municipal interdisant la baignade dans le lac, estimant que la mairie n'apportait pas la preuve d'un risque sanitaire réel. Les analyses produites par la commune dataient en effet de plus d'un an et ne portaient que sur une seule zone du lac. La mairie a indiqué qu'elle prenait acte de la décision, tout en rappelant que sa priorité restait la sécurité des baigneurs, et qu'elle ferait réaliser de nouvelles analyses dans les prochains jours.",
      },
      { speaker: "narratrice", text: "Pourquoi le tribunal a-t-il suspendu l'arrêté ?" },
    ],
    choices: [
      "Parce que la baignade est autorisée partout en été.",
      "Parce que les preuves du danger étaient insuffisantes.",
      "Parce que la mairie n'a pas le droit de faire des analyses.",
      "Parce que les baigneurs ont porté plainte.",
    ],
    answer: "B",
    note: "La mairie « n'apportait pas la preuve d'un risque sanitaire réel » : analyses anciennes et partielles.",
  },
  {
    n: 15,
    section: "oral",
    level: "C2",
    audio: [
      {
        speaker: "femme",
        text: "Il y a quelque chose de paradoxal dans notre rapport au silence. Nous le réclamons, nous payons pour lui, nous achetons des casques qui l'annulent, ce bruit qui nous cerne. Et pourtant, placés devant un silence véritable, celui d'une pièce insonorisée par exemple, la plupart d'entre nous ne tiennent pas plus de quelques minutes. Ce n'est donc pas le silence que nous cherchons, mais un bruit choisi, un bruit dont nous serions les auteurs. Le silence, le vrai, nous renvoie à nous-mêmes, et c'est précisément cela que nous fuyons.",
      },
      { speaker: "narratrice", text: "D'après la chroniqueuse, que recherchons-nous réellement ?" },
    ],
    choices: [
      "Un silence absolu et prolongé.",
      "Des casques de meilleure qualité.",
      "Un environnement sonore que nous contrôlons.",
      "Des pièces insonorisées dans nos logements.",
    ],
    answer: "C",
    note: "« Ce n'est pas le silence que nous cherchons, mais un bruit choisi, un bruit dont nous serions les auteurs. »",
  },

  // ───────────── STRUCTURE DE LA LANGUE ─────────────
  {
    n: 16,
    section: "structure",
    level: "A1",
    question: "Je voudrais un kilo ... tomates, s'il vous plaît.",
    choices: ["de", "des", "du", "à"],
    answer: "A",
    note: "Après une expression de quantité (un kilo, un litre, beaucoup), on emploie « de » sans article.",
  },
  {
    n: 17,
    section: "structure",
    level: "A1",
    question: "Mes parents ... à Marseille depuis dix ans.",
    choices: ["habite", "habitent", "habitons", "habitez"],
    answer: "B",
    note: "Sujet « mes parents » = ils : habitent.",
  },
  {
    n: 18,
    section: "structure",
    level: "A2",
    question: "Hier soir, nous ... un très bon film à la télévision.",
    choices: ["regardons", "regarderons", "avons regardé", "regardions"],
    answer: "C",
    note: "« Hier soir » et une action ponctuelle terminée : passé composé.",
  },
  {
    n: 19,
    section: "structure",
    level: "A2",
    question: "Tu connais Paul ? Oui, je ... ai rencontré à la fête de Julie.",
    choices: ["le", "lui", "l'", "y"],
    answer: "C",
    note: "« Rencontrer quelqu'un » : complément d'objet direct → le, élidé en l' devant une voyelle.",
  },
  {
    n: 20,
    section: "structure",
    level: "B1",
    question: "Si j'avais plus de temps, je ... du piano.",
    choices: ["fais", "ferai", "ferais", "faisais"],
    answer: "C",
    note: "Hypothèse à l'imparfait (« si j'avais ») → conditionnel présent dans la principale.",
  },
  {
    n: 21,
    section: "structure",
    level: "B1",
    question: "C'est la ville ... je suis né.",
    choices: ["que", "qui", "dont", "où"],
    answer: "D",
    note: "Complément de lieu (« je suis né dans cette ville ») → pronom relatif « où ».",
  },
  {
    n: 22,
    section: "structure",
    level: "B2",
    question: "Il faut que vous ... ce dossier avant vendredi.",
    choices: ["finissez", "finissiez", "finirez", "finiriez"],
    answer: "B",
    note: "« Il faut que » exige le subjonctif : que vous finissiez.",
  },
  {
    n: 23,
    section: "structure",
    level: "B2",
    question: "... il pleuve, la course aura lieu.",
    choices: ["Malgré", "Bien qu'", "Même si", "Pourtant"],
    answer: "B",
    note: "Le verbe est au subjonctif (« pleuve ») : seule « bien que » introduit le subjonctif. « Même si » demande l'indicatif, « malgré » un nom.",
  },
  {
    n: 24,
    section: "structure",
    level: "C1",
    question: "Elle a réussi son examen, ... personne ne s'attendait.",
    choices: ["ce que", "ce dont", "ce à quoi", "ce qui"],
    answer: "C",
    note: "« S'attendre à quelque chose » → ce à quoi.",
  },
  {
    n: 25,
    section: "structure",
    level: "C1",
    question: "Une fois les travaux ..., l'école rouvrira ses portes.",
    choices: ["terminer", "terminant", "terminés", "terminé"],
    answer: "C",
    note: "Proposition participiale avec « une fois » : participe passé accordé avec « les travaux » (masculin pluriel).",
  },

  // ───────────── COMPRÉHENSION ÉCRITE ─────────────
  {
    n: 26,
    section: "ecrit",
    level: "A1",
    passage: "PHARMACIE DU CENTRE\nOuvert du lundi au samedi, 9 h – 19 h 30\nFermé le dimanche\nPharmacie de garde ce week-end : Pharmacie de la Gare, 12 avenue Jaurès",
    question: "Vous avez besoin d'un médicament dimanche. Où allez-vous ?",
    choices: ["À la Pharmacie du Centre.", "À la Pharmacie de la Gare.", "À l'hôpital.", "Nulle part, tout est fermé."],
    answer: "B",
    note: "La Pharmacie du Centre est fermée le dimanche ; la pharmacie de garde est celle de la Gare.",
  },
  {
    n: 27,
    section: "ecrit",
    level: "A1",
    passage: "Salut Nadia ! Je suis en retard, le bus n'est pas passé. J'arrive au café dans 15 minutes. Commande-moi un thé, s'il te plaît. Bises, Sami",
    question: "Pourquoi Sami écrit-il à Nadia ?",
    choices: ["Pour annuler leur rendez-vous.", "Pour la prévenir de son retard.", "Pour l'inviter au café.", "Pour lui demander de venir en bus."],
    answer: "B",
    note: "« Je suis en retard … j'arrive dans 15 minutes » : il prévient de son retard.",
  },
  {
    n: 28,
    section: "ecrit",
    level: "A2",
    passage: "Objet : Cours de yoga – changement de salle\n\nBonjour à toutes et à tous,\n\nÀ partir de la semaine prochaine, le cours du mardi soir aura lieu à la salle des fêtes et non plus au gymnase, qui est en travaux jusqu'en décembre. L'horaire reste le même : 19 h. Pensez à apporter votre tapis, la salle n'en fournit pas.\n\nÀ mardi,\nClaire",
    question: "Qu'est-ce qui change pour le cours de yoga ?",
    choices: ["Le jour.", "L'heure.", "Le lieu.", "Le professeur."],
    answer: "C",
    note: "Le cours passe du gymnase à la salle des fêtes ; l'horaire « reste le même ».",
  },
  {
    n: 29,
    section: "ecrit",
    level: "A2",
    passage: "À LOUER – Appartement 2 pièces, 45 m², 3e étage sans ascenseur, cuisine équipée, balcon. Proche métro Jourdain (5 min à pied). Loyer 1 050 € charges comprises. Non fumeur. Animaux refusés. Disponible le 1er octobre.",
    question: "Quelle affirmation est vraie ?",
    choices: [
      "L'immeuble a un ascenseur.",
      "Les charges sont incluses dans le loyer.",
      "On peut avoir un chat.",
      "L'appartement est loin du métro.",
    ],
    answer: "B",
    note: "« 1 050 € charges comprises ». Pas d'ascenseur, animaux refusés, métro à 5 minutes.",
  },
  {
    n: 30,
    section: "ecrit",
    level: "B1",
    passage: "Depuis janvier, la ville de Rennes prête gratuitement des vélos électriques à ses habitants pour une durée d'un mois. L'objectif est simple : permettre à ceux qui hésitent d'essayer avant d'acheter. « Beaucoup de gens pensent que le vélo électrique, ce n'est pas pour eux, parce qu'ils habitent loin ou parce qu'il y a des côtes », explique l'adjointe aux transports. Résultat : après six mois, près de 40 % des emprunteurs ont acheté un vélo électrique, et la liste d'attente dépasse déjà mille personnes.",
    question: "Quel est le but principal de ce prêt de vélos ?",
    choices: [
      "Remplacer les bus de la ville.",
      "Faire essayer le vélo électrique avant un achat.",
      "Vendre les vélos de la ville.",
      "Réduire la liste d'attente.",
    ],
    answer: "B",
    note: "« Permettre à ceux qui hésitent d'essayer avant d'acheter. »",
  },
  {
    n: 31,
    section: "ecrit",
    level: "B1",
    passage: "Objet : Votre commande n° 48213\n\nMadame,\n\nNous avons bien reçu votre réclamation concernant la lampe livrée cassée. Nous vous présentons nos excuses pour ce désagrément. Un nouvel exemplaire vous sera expédié sous 48 heures, sans frais. Il n'est pas nécessaire de nous renvoyer l'article endommagé : vous pouvez le déposer dans un point de recyclage. Si vous préférez être remboursée, répondez simplement à ce message.\n\nCordialement,\nLe service client",
    question: "Que doit faire la cliente de la lampe cassée ?",
    choices: [
      "La renvoyer au magasin.",
      "La garder jusqu'à la livraison du nouvel exemplaire.",
      "La jeter dans un point de recyclage.",
      "La rapporter en boutique pour être remboursée.",
    ],
    answer: "C",
    note: "« Il n'est pas nécessaire de nous renvoyer l'article … vous pouvez le déposer dans un point de recyclage. »",
  },
  {
    n: 32,
    section: "ecrit",
    level: "B1",
    passage: "Le marché de Noël de Strasbourg accueillera cette année 300 chalets, soit 20 de moins qu'en 2023. La mairie explique cette baisse par la volonté de laisser plus de place aux piétons et de réduire les files d'attente. Les artisans locaux, eux, s'inquiètent : les chalets supprimés sont surtout les plus petits, ceux qui vendent des produits fabriqués dans la région. « On garde les grandes enseignes et on écarte les petits producteurs », regrette un fabricant de bredele.",
    question: "Pourquoi les artisans locaux sont-ils inquiets ?",
    choices: [
      "Les visiteurs seront moins nombreux.",
      "Les petits chalets sont les premiers supprimés.",
      "Le marché sera annulé en 2024.",
      "Les files d'attente vont augmenter.",
    ],
    answer: "B",
    note: "« Les chalets supprimés sont surtout les plus petits, ceux qui vendent des produits fabriqués dans la région. »",
  },
  {
    n: 33,
    section: "ecrit",
    level: "B2",
    passage: "Faut-il interdire les téléphones portables à l'école ? La question revient chaque rentrée. Les partisans de l'interdiction avancent des résultats scolaires en hausse dans les établissements qui l'ont adoptée, ainsi qu'une baisse du harcèlement. Leurs adversaires rétorquent que ces études ne prouvent rien : les écoles qui interdisent le téléphone sont souvent celles qui, par ailleurs, disposent de plus de moyens. Interdire l'outil, ajoutent-ils, revient à renoncer à apprendre aux élèves à s'en servir de façon raisonnée, ce qui est pourtant l'un des rôles de l'école.",
    question: "Quel argument les opposants à l'interdiction utilisent-ils ?",
    choices: [
      "Les résultats scolaires baissent sans téléphone.",
      "Les études citées ne tiennent pas compte des moyens des écoles.",
      "Le harcèlement augmente quand le téléphone est interdit.",
      "Les élèves refusent l'interdiction.",
    ],
    answer: "B",
    note: "« Les écoles qui interdisent le téléphone sont souvent celles qui disposent de plus de moyens » : l'amélioration peut venir d'ailleurs.",
  },
  {
    n: 34,
    section: "ecrit",
    level: "B2",
    passage: "Trois ans après son ouverture, la ligne de tramway T9 affiche une fréquentation supérieure de 30 % aux prévisions. Un succès qui a un revers : aux heures de pointe, les rames sont saturées et les usagers réclament des passages plus fréquents. Or, la ligne a été conçue pour un intervalle minimal de six minutes ; descendre en dessous exigerait de nouvelles rames et des travaux sur les carrefours, pour un coût estimé à 40 millions d'euros. La région dit étudier la question, sans calendrier.",
    question: "Pourquoi est-il difficile d'augmenter la fréquence des trams ?",
    choices: [
      "Parce que la fréquentation est trop faible.",
      "Parce que la ligne n'a pas été prévue pour cela.",
      "Parce que les usagers s'y opposent.",
      "Parce que la région a refusé définitivement.",
    ],
    answer: "B",
    note: "« La ligne a été conçue pour un intervalle minimal de six minutes » ; aller en dessous demande des rames et des travaux.",
  },
  {
    n: 35,
    section: "ecrit",
    level: "B2",
    passage: "Chers collègues,\n\nComme annoncé, nous passons à la semaine de quatre jours à compter du 1er mars. Précisons ce que cela implique. La durée hebdomadaire de travail reste fixée à 35 heures, réparties désormais sur quatre journées de 8 h 45. Le jour non travaillé sera le vendredi pour l'ensemble des équipes, à l'exception du service client, qui fonctionnera par roulement afin d'assurer une permanence. Les congés seront comptés en jours de 8 h 45. Cette organisation sera évaluée au bout de six mois.\n\nLa direction",
    question: "Que peut-on dire de cette nouvelle organisation ?",
    choices: [
      "Le temps de travail hebdomadaire diminue.",
      "Tous les salariés seront libres le vendredi.",
      "Elle est définitive.",
      "Les journées de travail seront plus longues.",
    ],
    answer: "D",
    note: "35 heures sur quatre jours = journées de 8 h 45. Le service client travaille par roulement ; évaluation après six mois, donc pas définitive.",
  },
  {
    n: 36,
    section: "ecrit",
    level: "C1",
    passage: "On a beaucoup glosé sur la « fin du travail » que devaient provoquer les machines. Force est de constater qu'elle n'a pas eu lieu : le taux d'emploi n'a jamais été aussi élevé dans les pays industrialisés. En revanche, ce que les machines ont bel et bien transformé, c'est la nature des tâches. Les métiers intermédiaires, routiniers mais qualifiés, se sont raréfiés, tandis que se multipliaient, aux deux extrémités de l'échelle, les emplois très qualifiés et les services à la personne, difficilement automatisables. Le problème n'est donc pas la quantité de travail, mais sa polarisation.",
    question: "Quelle est l'idée principale du texte ?",
    choices: [
      "Les machines ont supprimé la majorité des emplois.",
      "Le travail n'a pas disparu, mais sa structure s'est polarisée.",
      "Les services à la personne vont bientôt être automatisés.",
      "Le taux d'emploi baisse dans les pays industrialisés.",
    ],
    answer: "B",
    note: "« Le problème n'est donc pas la quantité de travail, mais sa polarisation. »",
  },
  {
    n: 37,
    section: "ecrit",
    level: "C1",
    passage: "Le succès de la « ville du quart d'heure », où tout serait accessible à pied en quinze minutes, ne doit pas faire oublier ses angles morts. Conçu pour des centres denses et anciens, le modèle s'applique mal aux périphéries pavillonnaires, où vivent pourtant la majorité des Français. Y transposer l'idée sans la repenser reviendrait à creuser encore l'écart entre un centre pourvu de tout et une banlieue qui devrait, elle, continuer de prendre sa voiture. Autrement dit, le concept est moins une solution universelle qu'un révélateur des inégalités territoriales.",
    question: "Que reproche l'auteur à la « ville du quart d'heure » ?",
    choices: [
      "Elle interdit la voiture partout.",
      "Elle ne convient pas aux zones peu denses.",
      "Elle est trop coûteuse pour les centres-villes.",
      "Elle a échoué dans les centres anciens.",
    ],
    answer: "B",
    note: "« Le modèle s'applique mal aux périphéries pavillonnaires » : il est pensé pour les centres denses.",
  },
  {
    n: 38,
    section: "ecrit",
    level: "C1",
    passage: "Les plateformes de streaming aiment à rappeler qu'elles ont « sauvé » la musique, dont les revenus, en chute libre au début des années 2000, ont retrouvé leur niveau d'antan. L'affirmation est exacte, à un détail près : la répartition. Lorsque le disque régnait, un artiste modeste pouvait vivre de quelques milliers de ventes. À l'ère du flux, les mêmes écoutes rapportent à peine de quoi payer un café, tandis qu'une poignée de vedettes concentre l'essentiel des revenus. L'industrie va mieux ; les musiciens, dans leur grande majorité, non.",
    question: "Que nuance l'auteur dans le discours des plateformes ?",
    choices: [
      "Les revenus de la musique n'ont pas remonté.",
      "Les plateformes n'ont sauvé que les grandes maisons de disques.",
      "La reprise profite à quelques artistes seulement.",
      "Le disque rapporte toujours plus que le streaming.",
    ],
    answer: "C",
    note: "« Une poignée de vedettes concentre l'essentiel des revenus. » Les revenus globaux ont bien remonté, c'est la répartition qui pose problème.",
  },
  {
    n: 39,
    section: "ecrit",
    level: "C2",
    passage: "Il est de bon ton de déplorer l'appauvrissement de la langue, comme si chaque génération inventait moins de mots que la précédente. C'est là confondre la langue et son usage lettré. Une langue ne s'appauvrit pas ; elle se déplace. Ce que perdent les registres soutenus, les registres familiers le gagnent au centuple, et la créativité lexicale des cours de récréation n'a rien à envier à celle des académies. La véritable inquiétude, si inquiétude il doit y avoir, tient moins à la langue elle-même qu'au nombre décroissant de locuteurs capables d'en parcourir tous les étages.",
    question: "Selon l'auteur, où réside le vrai problème ?",
    choices: [
      "Dans la disparition des mots familiers.",
      "Dans le manque d'inventivité des jeunes.",
      "Dans la capacité réduite à maîtriser tous les registres.",
      "Dans l'influence excessive des académies.",
    ],
    answer: "C",
    note: "« Le nombre décroissant de locuteurs capables d'en parcourir tous les étages » : maîtriser tous les registres.",
  },
  {
    n: 40,
    section: "ecrit",
    level: "C2",
    passage: "On prête volontiers à la mémoire les vertus d'une archive fidèle, dont l'oubli ne serait que la défaillance. Les neurosciences racontent une histoire inverse : oublier n'est pas une panne, c'est une fonction. Un cerveau qui retiendrait tout serait condamné à tout confondre, incapable de dégager une règle de la masse des cas particuliers. L'oubli fait le tri, efface le détail pour sauver la structure, et c'est à ce prix que nous pouvons généraliser, c'est-à-dire penser. Se souvenir de tout, ce serait ne plus rien comprendre.",
    question: "Quelle conception de l'oubli le texte défend-il ?",
    choices: [
      "L'oubli est un défaut que la science pourra corriger.",
      "L'oubli est nécessaire à la pensée.",
      "L'oubli concerne uniquement les règles générales.",
      "L'oubli menace la fidélité de nos archives.",
    ],
    answer: "B",
    note: "« Oublier n'est pas une panne, c'est une fonction … c'est à ce prix que nous pouvons généraliser, c'est-à-dire penser. »",
  },
];

export const tcfMockExam1: TcfMockExam = {
  id: "romaintalk-1",
  title: "Série d'entraînement Romaintalk n°1",
  items,
};

export const TCF_MOCK_EXAMS: Record<string, TcfMockExam> = {
  [tcfMockExam1.id]: tcfMockExam1,
};

export const DEFAULT_TCF_MOCK_EXAM = tcfMockExam1;

export const TCF_SECTION_META: Record<
  TcfSection,
  { label: string; consigne: string; range: [number, number] }
> = {
  oral: {
    label: "Compréhension orale",
    consigne:
      "Écoutez le document sonore et la question. Choisissez la bonne réponse et cliquez sur le bouton correspondant.",
    range: [1, 15],
  },
  structure: {
    label: "Structure de la langue",
    consigne:
      "Lisez la phrase. Choisissez la proposition qui la complète correctement et cliquez sur le bouton correspondant.",
    range: [16, 25],
  },
  ecrit: {
    label: "Compréhension écrite",
    consigne:
      "Lisez le document et la question. Choisissez la bonne réponse et cliquez sur le bouton correspondant.",
    range: [26, 40],
  },
};

/** Q1–3 wording differs: the question and the four replies are all spoken. */
export const TCF_SPOKEN_CHOICES_CONSIGNE =
  "Écoutez la question et les 4 réponses. Choisissez la réponse qui correspond à la question et cliquez sur le bouton correspondant.";

export function consigneFor(item: TcfMockItem): string {
  if (item.spokenChoices) return TCF_SPOKEN_CHOICES_CONSIGNE;
  return TCF_SECTION_META[item.section].consigne;
}

export function getTcfMockExam(id: unknown): TcfMockExam | null {
  return typeof id === "string" && id in TCF_MOCK_EXAMS ? TCF_MOCK_EXAMS[id] : null;
}

export function getTcfMockItem(examId: unknown, n: unknown): TcfMockItem | null {
  const exam = getTcfMockExam(examId);
  if (!exam || typeof n !== "number") return null;
  return exam.items.find(it => it.n === n) ?? null;
}

export const SPEAKER_LABEL: Record<TcfSpeaker, string> = {
  narratrice: "Narratrice",
  femme: "Femme",
  homme: "Homme",
  femme2: "Femme 2",
  homme2: "Homme 2",
};

/** Plain-text transcript of a listening item, one line per speaker turn. */
export function transcriptOf(item: TcfMockItem): string {
  if (!item.audio) return "";
  return item.audio.map(s => `${SPEAKER_LABEL[s.speaker]} : ${s.text}`).join("\n");
}
