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
    pageWidth: "Largeur",
    pageHeight: "Hauteur",
    margin: "Marge",
    combinePages: "Afficher les doubles pages",
    combinePagesHint: "Montrer les pages côte à côte, dans l'éditeur et le PDF",
    combinePagesHintPrinter: "attend une page physique par page de PDF",
    bleed: "Fond perdu",
    bleedEnabled: "Activer le fond perdu",
    
    // Layout settings
    spacing: "Espacement",
    filterVideos: "Exclure les vidéos",
    forceTimeline: "Forcer l'ordre chronologique",
    
    // Presentation settings
    showDates: "Afficher les dates",
    showCaptions: "Légendes de page",
    fontSize: "Taille de police",
    cardStyle: "Style de carte",
    pageBackground: "Fond de page",
    
    // Cover settings
    showCover: "Afficher la couverture",
    coverLayout: "Mise en page de la couverture",
    title: "Titre",
    coverTitle: "Titre de la couverture",
    coverPhoto: "Photo de couverture",
    layout: "Mise en page",
    backCover: "Quatrième de couverture",
    backCoverPhoto: "Photo de la quatrième",
    backCoverText: "Texte de la quatrième",
    backCoverLayout: "Mise en page de la quatrième",
    backCoverPhotoLabel: "Photo de la quatrième",
    removePhoto: "Retirer la photo",
    noPhotoHover: "Pas de photo - survolez une photo ci-dessous et cliquez sur « Définir comme quatrième de couverture » pour en ajouter une.",
    noCoverPhoto: "Pas de photo de couverture",
    excludeCoverPhotos: "Exclure les photos de couverture des pages",
    excludeCoverPhotosHint: "Certains imprimeurs génèrent leur propre couverture et ne veulent pas de couverture dans le PDF soumis",
    cardReordered: "Carte réorganisée",
    imageReordered: "Image réorganisée",
    
    // Actions
    generatePdf: "Générer le PDF",
    generating: "Génération...",
    downloadPdf: "Télécharger le PDF",
    printWith: "Imprimer ce PDF chez",
    generateCaptions: "Générer les légendes",
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
    coverLayoutPhotoTitle: "Photo et titre",
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
    modifications: "modifications",
    showHistory: "Afficher l'historique",
    
    // Page navigation
    pages: "pages",
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
    pageWidth: "Width",
    pageHeight: "Height",
    margin: "Margin",
    combinePages: "Show spreads",
    combinePagesHint: "Show spreads side by side, in the editor and the PDF",
    combinePagesHintPrinter: "expects one physical page per PDF page",
    bleed: "Bleed",
    bleedEnabled: "Enable bleed",
    
    // Layout settings
    spacing: "Spacing",
    filterVideos: "Exclude Videos",
    forceTimeline: "Force Timeline Order",
    
    // Presentation settings
    showDates: "Show Dates",
    showCaptions: "Page Captions",
    fontSize: "Font Size",
    cardStyle: "Card Style",
    pageBackground: "Page Background",
    
    // Cover settings
    showCover: "Show Cover",
    coverLayout: "Cover Layout",
    title: "Title",
    coverTitle: "Cover Title",
    coverPhoto: "Cover Photo",
    layout: "Layout",
    backCover: "Back Cover",
    backCoverPhoto: "Back Cover Photo",
    backCoverText: "Back Cover Text",
    backCoverLayout: "Back Cover Layout",
    backCoverPhotoLabel: "Back cover photo",
    removePhoto: "Remove photo",
    noPhotoHover: "No photo - hover a photo below and click \"Set as back cover\" to add one.",
    noCoverPhoto: "No cover photo",
    excludeCoverPhotos: "Exclude cover photos from pages",
    excludeCoverPhotosHint: "Some print services generate their own cover and don't want one in the submitted PDF",
    cardReordered: "Card reordered",
    imageReordered: "Image reordered",
    
    // Actions
    generatePdf: "Generate PDF",
    generating: "Generating...",
    downloadPdf: "Download PDF",
    printWith: "Print this PDF with",
    generateCaptions: "Generate Captions",
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
    modifications: "modifications",
    showHistory: "Show history",
    
    // Page navigation
    pages: "pages",
  },
};

export function t(lang: Language, key: keyof typeof translations.en): string {
  return translations[lang][key] || key;
}
