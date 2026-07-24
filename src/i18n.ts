export type Language = "fr" | "en";

export const translations = {
  fr: {
    // Header
    appTitle: "Immich Book",
    appSubtitle: "Créez des livres photo à partir de vos albums Immich",
    
    // Buttons
    back: "Retour",
    cancel: "Annuler",
    confirm: "Confirmer",
    close: "Fermer",
    
    // Tabs
    tabPage: "Page",
    tabLayout: "Mise en page",
    tabPresentation: "Présentation",
    tabCover: "Couverture",
    
    // Page settings
    printer: "Imprimeur",
    category: "Catégorie",
    format: "Format",
    width: "Largeur",
    height: "Hauteur",
    pageWidth: "Largeur",
    pageHeight: "Hauteur",
    margin: "Marge",
    combinePages: "Combiner les pages",
    combinePagesHint: "Montrer les pages côte à côte, dans l'éditeur et le PDF",
    combinePagesHintPrinter: "attend une page physique par page de PDF",
    bleed: "Fond perdu",
    bleedEnabled: "Activer le fond perdu",
    bleedHint: "Bordure supplémentaire remplie avec le fond de page, pour la production d'impression - rognée après l'impression",
    bleedRequired: "requiert",
    bleedNotRequired: "n'attend pas de fond perdu sur ce fichier",
    bleedUnit: "mm de fond perdu",
    
    // Layout settings
    spacing: "Espacement",
    filterVideos: "Exclure les vidéos",
    forceTimeline: "Forcer l'ordre chronologique",
    shufflePageLayout: "Essayer un autre arrangement pour cette page",
    
    // Presentation settings
    showDates: "Afficher les dates",
    showCaptions: "Légendes de page",
    fontSize: "Taille de police",
    cardStyle: "Style de carte",
    pageBackground: "Fond de page",
    
    // Cover settings
    showCover: "Afficher la couverture",
    includeCoverPage: "Inclure la page de couverture",
    includeCoverPageHint: "Certains services d'impression génèrent leur propre couverture et ne veulent pas de couverture dans le PDF soumis",
    leaveCoverPhotosOut: "Laisser les photos de couverture en dehors des pages intérieures",
    leaveCoverPhotosOutHint: "Sinon, les photos de couverture avant/arrière s'impriment également à l'intérieur du livre",
    coverLayout: "Mise en page de la couverture",
    title: "Titre",
    coverTitle: "Titre de la couverture",
    coverPhoto: "Photo de couverture",
    layout: "Mise en page",
    backCover: "Quatrième de couverture",
    backCoverPhoto: "Photo de la quatrième",
    backCoverText: "Texte de la quatrième",
    backCoverTextPlaceholder: "Note de fin facultative",
    backCoverLayout: "Mise en page de la quatrième",
    backCoverPhotoLabel: "Photo de la quatrième",
    removePhoto: "Retirer la photo",
    noPhotoHover: "Pas de photo - survolez une photo ci-dessous et cliquez sur « Définir comme quatrième de couverture » pour en ajouter une.",
    noCoverPhoto: "Pas de photo de couverture",
    excludeCoverPhotos: "Exclure les photos de couverture des pages",
    excludeCoverPhotosHint: "Certains imprimeurs génèrent leur propre couverture et ne veulent pas de couverture dans le PDF soumis",
    plainBackCoverText: "Texte simple au dos de la couverture",
    plainBackCoverTextHint: "Pas de carte derrière le texte - s'applique uniquement lorsque la quatrième de couverture n'a pas de photo",
    coverHint: "La couverture utilise le même fond de page que le reste du livre. Survolez une photo ci-dessous et cliquez sur « Définir comme couverture » ou « Définir comme quatrième de couverture » pour choisir les images avant et arrière - par défaut, ce sont la première et la dernière photo du livre.",
    cardReordered: "Carte réorganisée",
    imageReordered: "Image réorganisée",
    
    // Actions
    generatePdf: "Générer le PDF",
    generating: "Génération...",
    downloadPdf: "Télécharger le PDF",
    printWith: "Imprimer ce PDF chez",
    generateCaptions: "Générer les légendes",
    flatten: "Mettre à plat",
    history: "Historique",
    undoLastAction: "Annuler la dernière action",
    
    // History
    historyTitle: "Historique",
    noOperations: "Aucune opération",
    historySwapSamePage: "Échange de 2 photos sur la page",
    historySwapTextCards: "Échange de 2 cartes texte",
    historySwapCrossPage: "Déplacement de photos entre les pages",
    historySwapCrossPageDetail: "et",
    historyShuffleLayout: "Mélange de la mise en page de la page",
    historySetPageCount: "Changement du nombre de photos de la page",
    historySetPageCountTo: "à",
    historySetPageCountAuto: "auto",
    historySetTextCardCount: "Changement du nombre de cartes texte de la page",
    historyEditPageCaption: "Modification de la légende de la page",
    historyEditCardCaption: "Modification de la légende d'une photo",
    historyEditTextCard: "Modification d'une carte texte",
    historySetCover: "Changement de la photo de couverture",
    historySetBackCover: "Changement de la photo de quatrième de couverture",
    historyEditCoverTitle: "Modification du titre de couverture",
    historyEditBackCoverText: "Modification du texte de quatrième de couverture",
    historySwapNewPhoto: "Échange avec une nouvelle photo",
    historyReplacePlaceholder: "Remplacement d'un placeholder",
    historyInsertNewPhoto: "Insertion d'une nouvelle photo",
    historyDeletePlaceholder: "Suppression d'un placeholder",
    timeAgo_seconds: "s",
    timeAgo_minutes: "min",
    timeAgo_hours: "h",
    timeAgo_suffix: "",
    
    // Swap confirmation
    swapConfirmTitle: "Confirmer l'échange de photos",
    swapConfirmMessage: "Voulez-vous échanger ces deux photos ?",
    swapConfirm: "Confirmer l'échange",
    
    // Card selection
    cardSelected: "Carte sélectionnée - cliquez sur une autre carte pour l'échanger",
    
    // Page info
    pageOf: "Page",
    of: "sur",
    
    // Cover labels
    cover: "Couverture",
    backCoverLabel: "Quatrième de couverture",
    
    // Card styles
    cardStyleScrapbook: "Scrapbook",
    cardStyleClean: "Épuré",
    
    // Cover layouts
    coverLayoutPhotoTitle: "Photo & Titre",
    coverLayoutFullBleed: "Photo pleine page",
    coverLayoutTextOnly: "Texte uniquement",
    
    // Back cover layouts
    backCoverLayoutPhoto: "Avec photo",
    backCoverLayoutText: "Texte uniquement",
    
    // Errors
    pdfError: "Erreur lors de la génération du PDF",
    captionError: "Erreur lors de la génération des légendes",
    fetchError: "photos n'ont pas pu être récupérées et sont absentes du PDF - essayez de générer à nouveau.",
    
    // Sidebar
    openPanel: "Ouvrir le volet",
    closePanel: "Fermer le volet",
    albums: "Albums",
    dark: "Sombre",
    light: "Clair",
    
    // Reordering
    photosReordered: "photos réorganisées",
    resetOrder: "Réinitialiser l'ordre",
    reset: "Réinitialiser",
    resetAll: "Tout réinitialiser",
    resetAllConfirmTitle: "Confirmer la réinitialisation",
    resetAllConfirmMessage: "Voulez-vous vraiment réinitialiser toutes les modifications ? Cette action est irréversible et effacera :",
    resetAllConfirmList1: "• Tous les échanges de photos",
    resetAllConfirmList2: "• Toutes les modifications de mise en page",
    resetAllConfirmList3: "• Toutes les cartes texte",
    resetAllConfirmList4: "• Tout l'historique des opérations",
    flattenConfirmTitle: "Confirmer la mise à plat",
    flattenConfirmMessage: "Êtes-vous sûr de vouloir mettre à plat l'état actuel ? Cet état deviendra la nouvelle référence et tout l'historique sera effacé.",
    modifications: "modifications",
    showHistory: "Afficher l'historique",
    
    // Page navigation
    pages: "pages",
    
    // Captions
    addCaption: "Ajouter une légende...",
    
    // Placeholders
    pagesWithPlaceholders: "Pages avec photos manquantes",
    missingPhoto: "Photo manquante",
    deletePlaceholder: "Supprimer ce placeholder",
    
    // New photos
    newPhotosToPlace: "Nouvelles photos à placer",
    addHere: "+ Ajouter ici",
    loadingPhotos: "Chargement des photos...",
    analyzingChanges: "Analyse des changements...",
  },
  en: {
    // Header
    appTitle: "Immich Book",
    appSubtitle: "Create photo books from your Immich albums",
    
    // Buttons
    back: "Back",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    
    // Tabs
    tabPage: "Page",
    tabLayout: "Layout",
    tabPresentation: "Presentation",
    tabCover: "Cover",
    
    // Page settings
    printer: "Printer",
    category: "Category",
    format: "Format",
    width: "Width",
    height: "Height",
    pageWidth: "Width",
    pageHeight: "Height",
    margin: "Margin",
    combinePages: "Combine Pages",
    combinePagesHint: "Show spreads side by side, in the editor and the PDF",
    combinePagesHintPrinter: "expects one physical page per PDF page",
    bleed: "Bleed",
    bleedEnabled: "Enable bleed",
    bleedHint: "Extra border filled with the page background, for print production - trimmed off after printing",
    bleedRequired: "requires",
    bleedNotRequired: "doesn't expect bleed on this file",
    bleedUnit: "mm of bleed",
    
    // Layout settings
    spacing: "Spacing",
    filterVideos: "Exclude Videos",
    forceTimeline: "Force Timeline Order",
    shufflePageLayout: "Try another arrangement for this page",
    
    // Presentation settings
    showDates: "Show Dates",
    showCaptions: "Page Captions",
    fontSize: "Font Size",
    cardStyle: "Card Style",
    pageBackground: "Page Background",
    
    // Cover settings
    showCover: "Show Cover",
    includeCoverPage: "Include cover page",
    includeCoverPageHint: "Some print services generate their own cover and don't want one in the submitted PDF",
    leaveCoverPhotosOut: "Leave cover photos out of the interior pages",
    leaveCoverPhotosOutHint: "Otherwise the front/back cover photos also print again inside the book",
    coverLayout: "Cover Layout",
    title: "Title",
    coverTitle: "Cover Title",
    coverPhoto: "Cover Photo",
    layout: "Layout",
    backCover: "Back Cover",
    backCoverPhoto: "Back Cover Photo",
    backCoverText: "Back cover text",
    backCoverTextPlaceholder: "Optional closing note",
    backCoverLayout: "Back Cover Layout",
    backCoverPhotoLabel: "Back cover photo",
    removePhoto: "Remove photo",
    noPhotoHover: "No photo - hover a photo below and click \"Set as back cover\" to add one.",
    noCoverPhoto: "No cover photo",
    excludeCoverPhotos: "Exclude cover photos from pages",
    excludeCoverPhotosHint: "Some print services generate their own cover and don't want one in the submitted PDF",
    plainBackCoverText: "Plain back cover text",
    plainBackCoverTextHint: "No card behind the text - only applies when the back cover has no photo",
    coverHint: "The cover uses the same page background as the rest of the book. Hover a photo below and click \"Set as cover\" or \"Set as back cover\" to choose the front and back cover images - they default to the book's first and last photo.",
    cardReordered: "Card reordered",
    imageReordered: "Image reordered",
    
    // Actions
    generatePdf: "Generate PDF",
    generating: "Generating...",
    downloadPdf: "Download PDF",
    printWith: "Print this PDF with",
    generateCaptions: "Generate Captions",
    flatten: "Flatten",
    history: "History",
    undoLastAction: "Undo Last Action",
    
    // History
    historyTitle: "History",
    noOperations: "No operations yet",
    historySwapSamePage: "Swapped 2 photos on page",
    historySwapTextCards: "Swapped 2 text cards",
    historySwapCrossPage: "Moved photos between pages",
    historySwapCrossPageDetail: "and",
    historyShuffleLayout: "Shuffled layout on page",
    historySetPageCount: "Changed page",
    historySetPageCountTo: "photo count to",
    historySetPageCountAuto: "auto",
    historySetTextCardCount: "Changed page",
    historyEditPageCaption: "Edited page caption on page",
    historyEditCardCaption: "Edited photo caption",
    historyEditTextCard: "Edited text card",
    historySetCover: "Changed cover photo",
    historySetBackCover: "Changed back cover photo",
    historyEditCoverTitle: "Edited cover title",
    historyEditBackCoverText: "Edited back cover text",
    historySwapNewPhoto: "Swapped with a new photo",
    historyReplacePlaceholder: "Replaced a placeholder",
    historyInsertNewPhoto: "Inserted a new photo",
    historyDeletePlaceholder: "Deleted a placeholder",
    timeAgo_seconds: "s ago",
    timeAgo_minutes: "m ago",
    timeAgo_hours: "h ago",
    timeAgo_suffix: "ago",
    
    // Swap confirmation
    swapConfirmTitle: "Confirm Photo Swap",
    swapConfirmMessage: "Do you want to swap these two photos?",
    swapConfirm: "Confirm Swap",
    
    // Card selection
    cardSelected: "Card selected - click another card to swap with it",
    
    // Page info
    pageOf: "Page",
    of: "of",
    
    // Cover labels
    cover: "Cover",
    backCoverLabel: "Back Cover",
    
    // Card styles
    cardStyleScrapbook: "Scrapbook",
    cardStyleClean: "Clean",
    
    // Cover layouts
    coverLayoutPhotoTitle: "Photo & Title",
    coverLayoutFullBleed: "Full-bleed Photo",
    coverLayoutTextOnly: "Text Only",
    
    // Back cover layouts
    backCoverLayoutPhoto: "With Photo",
    backCoverLayoutText: "Text Only",
    
    // Errors
    pdfError: "Failed to generate PDF",
    captionError: "Failed to generate captions",
    fetchError: "photos couldn't be fetched and are missing from the PDF - try generating again.",
    
    // Sidebar
    openPanel: "Open panel",
    closePanel: "Close panel",
    albums: "Albums",
    dark: "Dark",
    light: "Light",
    
    // Reordering
    photosReordered: "photos reordered",
    resetOrder: "Reset order",
    reset: "Reset",
    resetAll: "Reset All",
    resetAllConfirmTitle: "Confirm Reset",
    resetAllConfirmMessage: "Are you sure you want to reset all modifications? This action is irreversible and will clear:",
    resetAllConfirmList1: "• All photo swaps",
    resetAllConfirmList2: "• All layout modifications",
    resetAllConfirmList3: "• All text cards",
    resetAllConfirmList4: "• Complete operation history",
    flattenConfirmTitle: "Confirm Flatten",
    flattenConfirmMessage: "Are you sure you want to flatten the current state? This state will become the new baseline and all history will be cleared.",
    modifications: "modifications",
    showHistory: "Show history",
    
    // Page navigation
    pages: "pages",
    
    // Captions
    addCaption: "Add caption...",
    
    // Placeholders
    pagesWithPlaceholders: "Pages with missing photos",
    missingPhoto: "Missing photo",
    deletePlaceholder: "Delete this placeholder",
    
    // New photos
    newPhotosToPlace: "New photos to place",
    addHere: "+ Add here",
    loadingPhotos: "Loading photos...",
    analyzingChanges: "Analyzing changes...",
  },
};

export function t(lang: Language, key: keyof typeof translations.en): string {
  return translations[lang][key] || key;
}
