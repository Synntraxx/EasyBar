# 🏷️ EasyBar — Générateur & Éditeur de Planches de Codes-Barres A4

EasyBar est un outil web SaaS interne haut de gamme, développé pour simplifier, accélérer et fiabiliser la création de planches d'étiquettes de codes-barres au format A4. Conçu selon la charte graphique et les besoins logistiques d'**Auchan**, il permet de générer des codes-barres vectoriels de précision industrielle, d'organiser des mises en page libres ou normées (grilles FLEG 7x2, planches de 12, 24 ou 8 étiquettes) et de garantir une impression *pixel-perfect*.

---

## 🚀 Fonctionnalités Clés

### 1. Génération Multi-Formats & Précision Vectorielle
*   **Symbologies supportées** : `CODE128` (standard logistique), `EAN-13` (grande distribution) et `CODE39` (alphanumérique).
*   **Rendu SVG Vectoriel** : Les codes-barres sont générés directement au format SVG pour éliminer tout flou ou pixellisation lors de l'impression, garantissant une lecture optimale au scanner en magasin.
*   **Affectation Automatique de Titre** : Saisie rapide avec détection automatique des catégories de produits (ex. détection automatique des rayons ou articles d'après la valeur saisie).

### 2. Gabarits de Planches A4 Réglementaires
*   **Mode Libre** : Positionnement libre par glisser-déposer.
*   **Gabarits Standards** : 12 étiquettes (105x49 mm), 24 étiquettes (70x37 mm), 8 étiquettes (105x74 mm).
*   **Gabarit FLEG (7x2)** : Spécialement optimisé pour l'étiquetage Fruits et Légumes (14 étiquettes).
    *   *Génération de Dates Rapide* : Génère et distribue automatiquement des dates sur toutes les étiquettes en un seul clic.
    *   *Sécurité Mode Date* : Verrouille la grille et la structure de la page pour éviter toute modification accidentelle d'étiquettes de prix/fraîcheur.

### 3. Espace de Travail Interactif
*   **Glisser-Déposer (Drag & Drop)** : Positionnement ultra-fluide des étiquettes en mode libre.
*   **Aimantation Intelligente (Snapping)** : Alignement automatique des étiquettes sur une grille invisible de 15px pour des planches propres et régulières.
*   **Calage des Bords Automatique** : Tolérance de calage de 25px pour plaquer parfaitement les étiquettes contre les bords physiques de la feuille.
*   **Redimensionnement Dynamique** : Poignée de redimensionnement intuitive en bas à droite de chaque carte.
*   **Édition en Ligne (Double-Clic)** : Double-cliquez directement sur la valeur d'une étiquette sur la planche pour la modifier à la volée.

### 4. Raccourcis Clavier Productivité
*   `Ctrl + C` / `Ctrl + V` : Dupliquez instantanément l'étiquette sélectionnée (avec décalage automatique pour éviter la superposition invisible).
*   `Suppr` (ou `Retour Arrière`) : Supprimez immédiatement l'étiquette active.
*   **Verrouillage du Zoom** : Bloque automatiquement les zooms intempestifs du navigateur (`Ctrl + molette`) pour préserver l'échelle physique A4 réelle à l'écran.

### 5. Gestion Multipage & Impression Ciblée
*   Support de **4 pages simultanées** au sein d'un même espace de travail.
*   Renommez facilement vos pages via le menu contextuel (clic droit sur l'onglet en bas) ou directement dans le volet latéral de configuration.
*   Modale d'impression sélective : Choix des pages à envoyer à l'imprimante (permet d'imprimer uniquement la page en cours ou une sélection spécifique).

### 6. Résilience & Persistance Locale
*   Sauvegarde automatique instantanée de l'intégralité du travail dans le `localStorage` du navigateur. Aucune perte de données en cas de fermeture accidentelle de la page ou de rafraîchissement.

---

## 🛠️ Architecture Technique

EasyBar est conçu avec un souci constant de performance, de sécurité et d'indépendance technologique :
*   **Core** : HTML5 Sémantique & Vanilla JavaScript (ES6+). Aucun framework lourd (React/Angular/Vue) requis, assurant un chargement instantané.
*   **Mise en page** : CSS3 moderne avec flexbox, grid layouts et requêtes de conteneur (`@container`) pour le redimensionnement fluide des polices de caractères au sein des étiquettes.
*   **Moteur Graphique** : Intégration de `JsBarcode` pour la génération mathématique des structures de barres.

---

## 🔒 Sécurité & Confidentialité (100% Local)

L'application EasyBar répond à des critères stricts de sécurité et de confidentialité pour l'environnement Auchan :
*   **Exécution 100% Locale** : L'intégralité du traitement et de la génération des étiquettes s'effectue sur le poste utilisateur. L'application ne nécessite aucune communication réseau active pour fonctionner.
*   **Aucun Flux Sortant** : Aucune donnée produit (codes-barres, titres, dates) n'est transmise ou sauvegardée vers un serveur externe ou tiers.
*   **Isolation des Réseaux Auchan** : L'outil fonctionne de manière totalement indépendante et n'accède à aucun moment aux serveurs, bases de données ou systèmes d'information internes d'Auchan.
*   **Sauvegarde Locale** : L'état de l'application est conservé uniquement dans le `localStorage` de votre navigateur sur votre propre machine (persistance hors-ligne).

---

## 🖨️ Configuration Requise pour l'Impression Chrome / Edge

Pour que les étiquettes s'alignent parfaitement avec les planches autocollantes prédécoupées en magasin, appliquez les paramètres suivants dans la boîte de dialogue d'impression (raccourci `Ctrl + P`) :

1.  **Destination** : Sélectionner l'imprimante laser du magasin ou "Enregistrer au format PDF".
2.  **Pages** : Toutes (ou la sélection personnalisée via l'application).
3.  **Disposition** : Portrait.
4.  **Format de papier** : **A4**.
5.  **Marges** : **Aucune** (ou régler à *Minimum* si votre modèle d'imprimante l'impose). **Important : Ne pas laisser en "Par défaut"** pour éviter l'ajout de marges blanches périphériques par le navigateur.
6.  **Échelle** : **100%** (ou *Par défaut*). **Ne pas cocher "Adapter à la zone d'impression"**.
7.  **Options** : Cocher **"Graphiques d'arrière-plan"** pour afficher les lignes de découpe ou les couleurs d'en-tête de rayon.

---

## ⌨️ Guide de Démarrage Rapide

1.  Ouvrez le fichier `index.html` dans Google Chrome ou Microsoft Edge.
2.  **Ajouter un code-barres** :
    *   Saisissez la valeur dans le volet de gauche.
    *   Sélectionnez le format (ex. `CODE128` ou `EAN13`).
    *   Cliquez sur **"Ajouter à la feuille"**.
3.  **Positionner & Dimensionner** :
    *   Glissez l'étiquette à l'emplacement souhaité (aimantation automatique).
    *   Utilisez la poignée dans le coin inférieur droit pour modifier sa taille.
4.  **Générer les étiquettes FLEG (Fruits & Légumes)** :
    *   Sélectionnez le modèle **"14 étiquettes (7x2 FLEG)"**.
    *   Saisissez ou choisissez une date dans le calendrier personnalisé.
    *   Cliquez sur **"Étiquettes FLEG"** pour remplir instantanément la planche.
5.  **Imprimer** :
    *   Cliquez sur **"Imprimer la page"**, sélectionnez les pages de votre choix, puis validez.

---

## 📁 Structure du Projet

```bash
├── index.html     # Structure sémantique de l'application & modales
├── style.css      # Charte graphique Auchan, variables de design & styles d'impression
├── script.js      # Moteur logique (drag & drop, raccourcis, LocalStorage, calendrier)
├── icon.png       # Icône et logo officiel de l'application
└── README.md      # Ce fichier de documentation
```

*Développé pour la productivité et la fluidité des équipes en magasin/drive Auchan.*
