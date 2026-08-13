document.addEventListener('DOMContentLoaded', () => {
    // Tableau contenant les objets de codes-barres actifs
    let barcodes = [];
    let selectedBarcodeId = null;
    let barcodeIdCounter = 0;

    // État multipage
    let totalPages = 1;
    let activePage = 1;
    let pageSettings = {}; // keyed by pageNumber: { gridType: 'free', showDate: false, dateValue: '' }
    const localDate = new Date();
    const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

    // Nœuds DOM cibles
    const printSheet = document.getElementById('print-sheet');
    const sheetPlaceholder = document.getElementById('sheet-placeholder');

    // Formulaires de la barre latérale
    const valueInput = document.getElementById('barcode-value-input');
    const formatSelect = document.getElementById('barcode-format-select');
    const customFormatSelect = document.getElementById('custom-format-select');
    const btnAddBarcode = document.getElementById('btn-add-barcode');
    // Boutons d'action généraux
    const btnPrintSheet = document.getElementById('btn-print-sheet');
    const btnClearSheet = document.getElementById('btn-clear-sheet');

    // Conteneur du menu contextuel personnalisé
    const contextMenu = document.getElementById('custom-context-menu');

    // Références DOM de la boîte modale du titre
    const titleModal = document.getElementById('title-modal');
    const titleModalInput = document.getElementById('title-modal-input');
    const btnCloseTitleModal = document.getElementById('btn-close-title-modal');
    const btnCancelTitleModal = document.getElementById('btn-cancel-title-modal');
    const btnSaveTitleModal = document.getElementById('btn-save-title-modal');
    let currentEditingBarcodeForTitle = null;

    // Références DOM du tiroir d'aide
    const helpModal = document.getElementById('help-modal');
    const btnHelp = document.getElementById('btn-help');
    const btnCloseHelpModal = document.getElementById('btn-close-help-modal');
    const btnCloseHelpOk = document.getElementById('btn-close-help-ok');

    // Nœuds DOM pour les paramètres de la page
    const dateInput = document.getElementById('page-date-input');
    const btnGenerateDates = document.getElementById('btn-generate-dates');
    const btnUnlockDateMode = document.getElementById('btn-unlock-date-mode');

    setupCustomDatePicker();

    let activeDragElement = null;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let contextMenuTargetId = null; // ID du code-barres stocké pour les actions contextuelles
    let contextMenuTargetPage = null; // Numéro de page stocké pour les actions contextuelles
    let copiedBarcodeData = null; // Configuration de code-barres stockée pour le copier-coller
    let currentTooltip = null;
    let tooltipTimeout = null;

    // ==========================================================================
    // LOGIQUE DU MENU DÉROULANT DE SÉLECTION PERSONNALISÉ
    // ==========================================================================
    const customSelect = customFormatSelect;
    if (customSelect) {
        const trigger = customSelect.querySelector('.custom-select-trigger');
        const triggerText = trigger.querySelector('span');
        const options = customSelect.querySelectorAll('.custom-select-option');
        const realSelect = document.getElementById('barcode-format-select');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            customSelect.classList.toggle('active');
        });

        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();

                // Mettre à jour les classes sélectionnées
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');

                // Mettre à jour l'affichage du texte
                triggerText.textContent = opt.textContent;

                // Synchroniser le sélecteur réel masqué et déclencher l'événement change
                if (realSelect) {
                    realSelect.value = opt.dataset.value;
                    realSelect.dispatchEvent(new Event('change'));
                }

                customSelect.classList.remove('active');
            });
        });

        // Synchroniser l'interface personnalisée si le sélecteur réel est modifié programmatiquement
        if (realSelect) {
            realSelect.addEventListener('change', () => {
                const targetOpt = Array.from(options).find(opt => opt.dataset.value === realSelect.value);
                if (targetOpt) {
                    options.forEach(o => o.classList.remove('selected'));
                    targetOpt.classList.add('selected');
                    triggerText.textContent = targetOpt.textContent;
                }
            });
        }

        // Fermer le menu déroulant en cliquant à l'extérieur
        document.addEventListener('click', () => {
            customSelect.classList.remove('active');
        });
    }

    // ==========================================================================
    // DÉCLENCHEURS D'ACTIONS ET GESTIONNAIRES DE FORMULAIRES
    // ==========================================================================

    btnAddBarcode.addEventListener('click', () => {
        const val = valueInput.value.trim();
        const format = formatSelect.value;
        if (!val) return;

        const pageSet = getPageSettings(activePage);
        if (pageSet && pageSet.isDateMode) {
            showCustomAlert("Page bloquée", "Cette page est bloquée en mode date. Pour ajouter un code-barres, changez le modèle ou videz la page.");
            return;
        }

        let limit = Infinity;
        if (pageSet) {
            if (pageSet.gridType === 'grid-12') limit = 12;
            else if (pageSet.gridType === 'grid-24') limit = 24;
            else if (pageSet.gridType === 'grid-8') limit = 8;
            else if (pageSet.gridType === 'grid-14') limit = 14;
        }
        const currentCount = barcodes.filter(b => b.page === activePage).length;
        if (currentCount >= limit) {
            showCustomAlert("Limite atteinte", `Cette grille ne peut pas contenir plus de ${limit} étiquettes.`);
            return;
        }

        addNewBarcode(val, format);
        valueInput.value = ''; // Réinitialiser le champ de saisie après l'insertion
    });

    valueInput.addEventListener('input', () => {
        // Retirer l'info-bulle si elle est active lorsque l'utilisateur commence à saisir
        if (currentTooltip) {
            currentTooltip.style.opacity = '0';
            currentTooltip.style.transform = 'translateY(-50%) translateX(8px)';
            const tooltipToRemove = currentTooltip;
            setTimeout(() => {
                tooltipToRemove.remove();
                if (currentTooltip === tooltipToRemove) {
                    currentTooltip = null;
                }
            }, 300);
        }
        if (formatSelect.value === 'CODE39') {
            valueInput.value = valueInput.value.toUpperCase();
        }
    });
    formatSelect.addEventListener('change', () => {
        if (formatSelect.value === 'CODE39') {
            valueInput.value = valueInput.value.toUpperCase();
        }
    });

    // Gestionnaire principal de génération de codes-barres avec dimensionnement en pourcentage pour préserver l'échelle
    function addNewBarcode(value, format, cardWPct = 34, cardHPct = 11, height = 55, width = 2, displayValue = true, title = "", leftPercent = null, topPercent = null, page = null, isDateOnly = false) {
        const finalPage = page !== null ? page : activePage;
        const pageSet = getPageSettings(finalPage);

        if (pageSet && pageSet.isDateMode && !isDateOnly) {
            return;
        }

        let limit = Infinity;
        if (pageSet) {
            if (pageSet.gridType === 'grid-12') limit = 12;
            else if (pageSet.gridType === 'grid-24') limit = 24;
            else if (pageSet.gridType === 'grid-8') limit = 8;
            else if (pageSet.gridType === 'grid-14') limit = 14;
        }
        const currentCount = barcodes.filter(b => b.page === finalPage).length;
        if (currentCount >= limit) {
            return;
        }

        barcodeIdCounter++;
        const id = `bc_${Date.now()}_${barcodeIdCounter}`;

        // Positionnement en cascade, centrage horizontal de la carte par défaut
        const count = barcodes.filter(b => b.page === finalPage).length;
        const finalLeft = leftPercent !== null ? leftPercent : (100 - cardWPct) / 2; // Parfaitement centré par défaut
        const finalTop = topPercent !== null ? topPercent : (15 + (count * 12) % 50);

        let finalTitle = title;
        if (!finalTitle && leftPercent === null && !isDateOnly) {
            const cleanVal = format === 'CODE39' ? value.toUpperCase() : value;
            if (cleanVal.endsWith('81035')) {
                finalTitle = "FRAIS";
            } else if (cleanVal.endsWith('81025')) {
                finalTitle = "SURG";
            }
        }

        const bcObj = {
            id,
            value: isDateOnly ? value : (format === 'CODE39' ? value.toUpperCase() : value),
            format,
            cardWidthPercent: cardWPct,
            cardHeightPercent: cardHPct,
            height,
            width,
            displayValue,
            leftPercent: finalLeft,
            topPercent: finalTop,
            title: finalTitle,
            page: finalPage,
            isDateOnly,
            element: null
        };

        barcodes.push(bcObj);

        if (finalPage === activePage) {
            const pageSet = getPageSettings(activePage);
            if (pageSet && pageSet.gridType !== 'free') {
                applyPageSettingsToUI();
            } else {
                createBarcodeDOM(bcObj);
            }
            selectBarcode(id);
        }

        updatePlaceholder();
    }

    // ==========================================================================
    // INITIALISATION ET RENDU DOM DES CARTES DE CODES-BARRES
    // ==========================================================================
    function getPageSettings(pageNum) {
        if (!pageSettings[pageNum]) {
            pageSettings[pageNum] = { gridType: 'free', showDate: false, dateValue: '', isDateMode: false };
        }
        if (pageSettings[pageNum].isDateMode === undefined) {
            pageSettings[pageNum].isDateMode = false;
        }
        return pageSettings[pageNum];
    }

    function getGridConfig(gridType) {
        const configs = {
            'grid-12': { cols: 2, rows: 6, wPct: 50, hPct: 16.6666 },
            'grid-24': { cols: 3, rows: 8, wPct: 33.3333, hPct: 12.5 },
            'grid-8': { cols: 2, rows: 4, wPct: 50, hPct: 25 },
            'grid-14': { cols: 2, rows: 7, wPct: 50, hPct: 14.2857 }
        };
        return configs[gridType] || null;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}`;
        }
        return dateStr;
    }

    // ==========================================================================
    // INITIALISATION ET RENDU DOM DES CARTES DE CODES-BARRES
    // ==========================================================================
    function createBarcodeDOM(bc) {
        const card = document.createElement('div');
        card.className = 'draggable-barcode';
        if (bc.isDateOnly) {
            card.classList.add('date-only-card');
        }

        // Calculer les surcharges de disposition de grille si la page a des paramètres de grille
        const pageSet = getPageSettings(bc.page);
        let left = bc.leftPercent;
        let top = bc.topPercent;
        let w = bc.cardWidthPercent;
        let h = bc.cardHeightPercent;

        if (pageSet && pageSet.gridType !== 'free') {
            const gridConfig = getGridConfig(pageSet.gridType);
            if (gridConfig) {
                // Trouver l'index de ce code-barres dans sa page
                const pageBarcodes = barcodes.filter(b => b.page === bc.page);
                const idx = pageBarcodes.indexOf(bc);
                if (idx !== -1) {
                    const col = idx % gridConfig.cols;
                    const row = Math.floor(idx / gridConfig.cols);
                    left = col * gridConfig.wPct;
                    top = row * gridConfig.hPct;
                    w = gridConfig.wPct;
                    h = gridConfig.hPct;
                }
            }
        }

        card.style.left = `${left}%`;
        card.style.top = `${top}%`;
        card.style.width = `${w}%`;
        card.style.height = `${h}%`;
        card.dataset.id = bc.id;

        // Titre personnalisé et en-tête de date en haut de la carte
        const headerEl = document.createElement('div');
        headerEl.className = 'barcode-card-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'barcode-card-title';
        if (bc.title) {
            titleEl.textContent = bc.title.toUpperCase();
        } else {
            titleEl.classList.add('hidden');
        }
        headerEl.appendChild(titleEl);

        const dateEl = document.createElement('span');
        dateEl.className = 'barcode-card-date';
        if (!bc.isDateOnly && pageSet && pageSet.showDate && pageSet.dateValue) {
            dateEl.textContent = formatDate(pageSet.dateValue);
        } else {
            dateEl.classList.add('hidden');
        }
        headerEl.appendChild(dateEl);


        // Masquer entièrement l'en-tête si le titre et la date sont masqués
        if (!bc.title && (bc.isDateOnly || !pageSet || !pageSet.showDate)) {
            headerEl.classList.add('hidden');
        }
        card.appendChild(headerEl);

        if (bc.isDateOnly) {
            const dateValEl = document.createElement('div');
            dateValEl.className = 'date-only-value';
            dateValEl.textContent = formatDate(bc.value);
            card.appendChild(dateValEl);
        } else {
            // Canvas vectoriel SVG
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = `svg_${bc.id}`;
            card.appendChild(svg);
        }

        // Poignée de redimensionnement en bas à droite
        const resizer = document.createElement('div');
        resizer.className = 'barcode-resize-handle';
        if (pageSet && pageSet.gridType !== 'free') {
            resizer.style.display = 'none';
        }
        card.appendChild(resizer);

        printSheet.appendChild(card);
        bc.element = card;

        // Dessiner les codes-barres
        if (!bc.isDateOnly) {
            renderBarcodeGraphics(bc);
        }

        // Événements de clic de souris sur la carte
        card.addEventListener('mousedown', (e) => {
            selectBarcode(bc.id);
        });
        card.addEventListener('touchstart', (e) => {
            selectBarcode(bc.id);
        });

        // Le double-clic déclenche l'affichage d'un champ de modification superposé
        card.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const pageSet = getPageSettings(activePage);
            if (bc.isDateOnly && pageSet && pageSet.gridType !== 'free') {
                return;
            }
            startInlineEdit(bc);
        });

        // Glissement de souris pour redimensionner en utilisant des pourcentages relatifs à la feuille parente
        resizer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const startWidth = card.offsetWidth;
            const startHeight = card.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;

            function onMouseMove(moveEvent) {
                const parentRect = printSheet.getBoundingClientRect();
                let newWidth = Math.max(110, startWidth + (moveEvent.clientX - startX));
                let newHeight = Math.max(65, startHeight + (moveEvent.clientY - startY));

                // Aligner sur la grille (aimantation)
                const gridSpacing = 15;
                newWidth = Math.round(newWidth / gridSpacing) * gridSpacing;
                newHeight = Math.round(newHeight / gridSpacing) * gridSpacing;

                let pctWidth = (newWidth / parentRect.width) * 100;
                let pctHeight = (newHeight / parentRect.height) * 100;

                // S'assurer que la largeur et la hauteur de la carte ne dépassent pas les limites de la feuille
                const maxAllowedWidthPct = 100 - bc.leftPercent;
                const maxAllowedHeightPct = 100 - bc.topPercent;

                pctWidth = Math.min(pctWidth, maxAllowedWidthPct);
                pctHeight = Math.min(pctHeight, maxAllowedHeightPct);

                card.style.width = `${pctWidth}%`;
                card.style.height = `${pctHeight}%`;

                bc.cardWidthPercent = pctWidth;
                bc.cardHeightPercent = pctHeight;

                // Ajuster les hauteurs internes des codes-barres en fonction de l'échelle relative
                const actualPixelHeight = (pctHeight / 100) * parentRect.height;
                bc.height = Math.max(30, Math.min(130, Math.floor(actualPixelHeight * 0.5)));
                renderBarcodeGraphics(bc);
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveState();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Initialiser le mouvement de glissement
        initDragAndDrop(card);
    }

    // Rendre JsBarcode avec mise en correspondance des rapports d'aspect vectoriels
    function renderBarcodeGraphics(bc) {
        const svg = bc.element.querySelector('svg');
        svg.innerHTML = '';

        if (bc.format === 'EAN13') {
            const cleanNum = bc.value.replace(/\D/g, '');
            if (cleanNum.length < 12 || cleanNum.length > 13) {
                showFormatError(svg, "EAN13 requis : 12-13 chiffres");
                return;
            }
        }

        // Ajuster la hauteur pour les dispositions en grille
        const pageSet = getPageSettings(bc.page);
        let drawHeight = bc.height;
        if (pageSet && pageSet.gridType !== 'free' && bc.element) {
            const cardRect = bc.element.getBoundingClientRect();
            // Ajuster automatiquement la hauteur à environ 45% de la hauteur réelle de la carte en pixels
            drawHeight = Math.max(25, Math.min(120, Math.floor(cardRect.height * 0.45)));
        }

        try {
            JsBarcode(svg, bc.value, {
                format: bc.format,
                height: bc.height,
                width: bc.width,
                displayValue: bc.displayValue,
                background: "transparent",
                lineColor: "#000000",
                fontSize: 13,
                fontWeight: 600,
                font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                valid: function (valid) {
                    if (valid) {
                        const wAttr = svg.getAttribute('width');
                        const hAttr = svg.getAttribute('height');
                        if (wAttr && hAttr) {
                            const cleanW = wAttr.replace(/[^0-9.]/g, '');
                            const cleanH = hAttr.replace(/[^0-9.]/g, '');
                            svg.setAttribute('viewBox', `0 0 ${cleanW} ${cleanH}`);
                            svg.style.width = '100%';
                            svg.style.height = '100%';
                            svg.removeAttribute('width');
                            svg.removeAttribute('height');
                        }
                    } else {
                        showFormatError(svg, "Code Invalide");
                    }
                }
            });
        } catch (err) {
            showFormatError(svg, "Erreur Format");
        }
    }

    function showFormatError(svg, msg) {
        svg.innerHTML = `
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter" font-size="11" fill="#d6180b" font-weight="600">
                ${msg}
            </text>
        `;
    }

    // ==========================================================================
    // LOGIQUE DE MOUVEMENT GLISSER-DÉPOSER (POSITIONNEMENT EN POURCENTAGE)
    // ==========================================================================
    function initDragAndDrop(element) {
        element.addEventListener('mousedown', dragStart);
        element.addEventListener('touchstart', dragStart, { passive: false });

        function dragStart(e) {
            if (e.type === 'mousedown' && e.button !== 0) {
                return;
            }

            if (e.target.closest('.barcode-resize-handle') ||
                e.target.closest('.barcode-inline-edit-box')) {
                return;
            }

            const bc = barcodes.find(b => b.id === element.dataset.id);
            const pageSet = getPageSettings(activePage);
            if (bc && bc.isDateOnly && pageSet && pageSet.gridType !== 'free') {
                return;
            }

            activeDragElement = element;
            element.classList.add('dragging');
            document.body.classList.add('dragging-active');
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            startX = clientX;
            startY = clientY;

            const rect = element.getBoundingClientRect();
            const parentRect = printSheet.getBoundingClientRect();

            initialLeft = rect.left - parentRect.left;
            initialTop = rect.top - parentRect.top;

            document.addEventListener('mousemove', dragMove, { passive: false });
            document.addEventListener('touchmove', dragMove, { passive: false });
            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('touchend', dragEnd);

            e.preventDefault();
        }

        function dragMove(e) {
            if (activeDragElement !== element) return;

            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            const parentRect = printSheet.getBoundingClientRect();
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            const maxLeft = parentRect.width - element.offsetWidth;
            const maxTop = parentRect.height - element.offsetHeight;

            // Snap coordinates relative to current grid spacing (starting at 0 for every edge)
            const gridSpacing = 15;
            const snapTolerance = 25; // Tolérance plus grande pour les bords de la feuille

            // Appliquer une tolérance d'aimantation des bords pour assurer un alignement parfait aux limites
            if (newLeft < snapTolerance) {
                newLeft = 0;
            } else if (newLeft > maxLeft - snapTolerance) {
                newLeft = maxLeft;
            } else {
                newLeft = Math.round(newLeft / gridSpacing) * gridSpacing;
            }

            if (newTop < snapTolerance) {
                newTop = 0;
            } else if (newTop > maxTop - snapTolerance) {
                newTop = maxTop;
            } else {
                newTop = Math.round(newTop / gridSpacing) * gridSpacing;
            }

            const pctLeft = (newLeft / parentRect.width) * 100;
            const pctTop = (newTop / parentRect.height) * 100;

            element.style.left = `${pctLeft}%`;
            element.style.top = `${pctTop}%`;

            const bc = barcodes.find(b => b.id === element.dataset.id);
            if (bc) {
                bc.leftPercent = pctLeft;
                bc.topPercent = pctTop;
            }

            e.preventDefault();
        }

        function dragEnd() {
            if (activeDragElement) {
                activeDragElement.classList.remove('dragging');
            }
            document.body.classList.remove('dragging-active');
            activeDragElement = null;
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('touchmove', dragMove);
            document.removeEventListener('mouseup', dragEnd);
            document.removeEventListener('touchend', dragEnd);
            saveState();
        }
    }

    // ==========================================================================
    // SELECTION HANDLING
    // ==========================================================================
    function selectBarcode(id) {
        selectedBarcodeId = id;

        document.querySelectorAll('.draggable-barcode').forEach(el => {
            el.classList.remove('selected');
        });

        const bc = barcodes.find(b => b.id === id);
        if (bc && bc.element) {
            bc.element.classList.add('selected');
        }
    }

    function unselectBarcode() {
        selectedBarcodeId = null;
        document.querySelectorAll('.draggable-barcode').forEach(el => {
            el.classList.remove('selected');
        });
    }

    printSheet.addEventListener('mousedown', (e) => {
        if (e.target === printSheet) {
            unselectBarcode();
        }
    });

    function showCustomConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const btnConfirm = document.getElementById('btn-save-confirm-modal');
            const btnCancel = document.getElementById('btn-cancel-confirm-modal');
            const btnClose = document.getElementById('btn-close-confirm-modal');

            if (!modal || !titleEl || !messageEl || !btnConfirm || !btnCancel || !btnClose) {
                resolve(confirm(message));
                return;
            }

            titleEl.textContent = title;
            messageEl.textContent = message;

            modal.classList.remove('hidden');

            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                modal.classList.add('hidden');
                btnConfirm.removeEventListener('click', handleConfirm);
                btnCancel.removeEventListener('click', handleCancel);
                btnClose.removeEventListener('click', handleCancel);
            };

            btnConfirm.addEventListener('click', handleConfirm);
            btnCancel.addEventListener('click', handleCancel);
            btnClose.addEventListener('click', handleCancel);
        });
    }

    function showCustomAlert(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const btnConfirm = document.getElementById('btn-save-confirm-modal');
            const btnCancel = document.getElementById('btn-cancel-confirm-modal');
            const btnClose = document.getElementById('btn-close-confirm-modal');

            if (!modal || !titleEl || !messageEl || !btnConfirm || !btnCancel || !btnClose) {
                alert(message);
                resolve();
                return;
            }

            titleEl.textContent = title;
            messageEl.textContent = message;

            const originalConfirmText = btnConfirm.textContent;
            btnConfirm.textContent = "OK";
            const originalCancelDisplay = btnCancel.style.display;
            btnCancel.style.display = 'none';

            modal.classList.remove('hidden');

            const handleClose = () => {
                modal.classList.add('hidden');
                btnConfirm.textContent = originalConfirmText;
                btnCancel.style.display = originalCancelDisplay;

                btnConfirm.removeEventListener('click', handleClose);
                btnCancel.removeEventListener('click', handleClose);
                btnClose.removeEventListener('click', handleClose);
                resolve();
            };

            btnConfirm.addEventListener('click', handleClose);
            btnCancel.addEventListener('click', handleClose);
            btnClose.addEventListener('click', handleClose);
        });
    }

    function showCustomPrompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('rename-page-modal');
            const titleEl = modal ? modal.querySelector('h2') : null;
            const messageEl = modal ? modal.querySelector('p') : null;
            const inputEl = document.getElementById('rename-page-input');
            const btnSave = document.getElementById('btn-save-rename-page-modal');
            const btnCancel = document.getElementById('btn-cancel-rename-page-modal');
            const btnClose = document.getElementById('btn-close-rename-page-modal');

            if (!modal || !inputEl || !btnSave || !btnCancel || !btnClose) {
                resolve(prompt(message, defaultValue));
                return;
            }

            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.textContent = message;
            inputEl.value = defaultValue;

            modal.classList.remove('hidden');
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 50);

            const handleSave = () => {
                const val = inputEl.value;
                cleanup();
                resolve(val);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleKeyDown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                }
            };

            const handleBackdropClick = (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            };

            const cleanup = () => {
                modal.classList.add('hidden');
                btnSave.removeEventListener('click', handleSave);
                btnCancel.removeEventListener('click', handleCancel);
                btnClose.removeEventListener('click', handleCancel);
                inputEl.removeEventListener('keydown', handleKeyDown);
                modal.removeEventListener('mousedown', handleBackdropClick);
            };

            btnSave.addEventListener('click', handleSave);
            btnCancel.addEventListener('click', handleCancel);
            btnClose.addEventListener('click', handleCancel);
            inputEl.addEventListener('keydown', handleKeyDown);
            modal.addEventListener('mousedown', handleBackdropClick);
        });
    }

    async function deleteBarcode(id) {
        const idx = barcodes.findIndex(b => b.id === id);
        if (idx !== -1) {
            const confirmed = await showCustomConfirm(
                "Supprimer l'étiquette",
                "Voulez-vous vraiment supprimer cette étiquette de code-barres ?"
            );
            if (confirmed) {
                const bc = barcodes[idx];
                barcodes.splice(idx, 1);
                if (selectedBarcodeId === id) {
                    unselectBarcode();
                }

                const pageSet = getPageSettings(activePage);
                if (pageSet && pageSet.gridType !== 'free') {
                    applyPageSettingsToUI();
                } else if (bc.element) {
                    bc.element.remove();
                }

                updatePlaceholder();
            }
        }
    }

    function clearAllBarcodes() {
        // Vider uniquement les codes-barres de la page active
        barcodes.forEach(bc => {
            if (bc.page === activePage && bc.element) {
                bc.element.remove();
            }
        });
        barcodes = barcodes.filter(bc => bc.page !== activePage);

        const pageSet = getPageSettings(activePage);
        if (pageSet) {
            pageSet.isDateMode = false;
        }

        unselectBarcode();
        applyPageSettingsToUI();
        renderTabs();
        saveState();
    }

    btnClearSheet.addEventListener('click', async () => {
        const confirmed = await showCustomConfirm(
            "Vider la page",
            "Voulez-vous vraiment vider tous les codes-barres de cette page ?"
        );
        if (confirmed) {
            clearAllBarcodes();
        }
    });

    function updatePrintButtonLabel() {
        if (!btnPrintSheet) return;
        if (totalPages > 1) {
            btnPrintSheet.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Paramètres d'impression
            `;
        } else {
            btnPrintSheet.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Imprimer la page
            `;
        }
    }

    function handlePrintButtonClick() {
        if (totalPages === 1) {
            printSelectedPages([1]);
        } else {
            openPrintModal();
        }
    }

    btnPrintSheet.addEventListener('click', handlePrintButtonClick);

    function saveState() {
        const state = {
            totalPages,
            activePage,
            pageSettings,
            barcodes: barcodes.map(bc => ({
                value: bc.value,
                format: bc.format,
                cardWidthPercent: bc.cardWidthPercent,
                cardHeightPercent: bc.cardHeightPercent,
                height: bc.height,
                width: bc.width,
                displayValue: bc.displayValue,
                leftPercent: bc.leftPercent,
                topPercent: bc.topPercent,
                title: bc.title,
                page: bc.page || 1,
                isDateOnly: bc.isDateOnly || false
            }))
        };
        localStorage.setItem('easybar_state_v3', JSON.stringify(state));
    }

    function loadState() {
        let saved = localStorage.getItem('easybar_state_v3');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                totalPages = parsed.totalPages || 1;
                activePage = parsed.activePage || 1;
                pageSettings = parsed.pageSettings || {};

                // S'assurer que chaque page a ses paramètres par défaut s'ils manquent
                for (let i = 1; i <= totalPages; i++) {
                    if (!pageSettings[i]) {
                        pageSettings[i] = { gridType: 'free', showDate: false, dateValue: '', isDateMode: false };
                    }
                    if (pageSettings[i].isDateMode === undefined) {
                        pageSettings[i].isDateMode = false;
                    }
                }

                if (Array.isArray(parsed.barcodes)) {
                    parsed.barcodes.forEach(item => {
                        addNewBarcode(
                            item.value,
                            item.format,
                            item.cardWidthPercent,
                            item.cardHeightPercent,
                            item.height,
                            item.width,
                            item.displayValue,
                            item.title,
                            item.leftPercent,
                            item.topPercent,
                            item.page || 1,
                            item.isDateOnly || false
                        );
                    });
                    return true;
                }
            } catch (e) {
                console.error("Error loading saved state v3:", e);
            }
        }

        // Migrer depuis la v2
        saved = localStorage.getItem('easybar_state_v2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                totalPages = parsed.totalPages || 1;
                activePage = parsed.activePage || 1;
                pageSettings = {};
                for (let i = 1; i <= totalPages; i++) {
                    pageSettings[i] = { gridType: 'free', showDate: false, dateValue: '' };
                }

                if (Array.isArray(parsed.barcodes)) {
                    parsed.barcodes.forEach(item => {
                        addNewBarcode(
                            item.value,
                            item.format,
                            item.cardWidthPercent,
                            item.cardHeightPercent,
                            item.height,
                            item.width,
                            item.displayValue,
                            item.title,
                            item.leftPercent,
                            item.topPercent,
                            item.page || 1
                        );
                    });
                    return true;
                }
            } catch (e) {
                console.error("Error migrating saved state v2:", e);
            }
        }

        // Migrer depuis le format hérité
        saved = localStorage.getItem('easybar_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    totalPages = 1;
                    activePage = 1;
                    pageSettings = { 1: { gridType: 'free', showDate: false, dateValue: '' } };
                    parsed.forEach(item => {
                        addNewBarcode(
                            item.value,
                            item.format,
                            item.cardWidthPercent,
                            item.cardHeightPercent,
                            item.height,
                            item.width,
                            item.displayValue,
                            item.title,
                            item.leftPercent,
                            item.topPercent,
                            1
                        );
                    });
                    return true;
                }
            } catch (e) {
                console.error("Error migrating saved state:", e);
            }
        }
        return false;
    }

    function updatePlaceholder() {
        const pageBarcodes = barcodes.filter(bc => bc.page === activePage);
        if (sheetPlaceholder) {
            if (pageBarcodes.length > 0) {
                sheetPlaceholder.classList.add('hidden');
            } else {
                sheetPlaceholder.classList.remove('hidden');
            }
        }

        if (btnClearSheet) {
            btnClearSheet.disabled = (pageBarcodes.length === 0);
        }

        saveState();
    }

    // ==========================================================================
    // INTERACTION D'ÉDITION EN LIGNE (DOUBLE-CLIC / MODIFICATION DU TEXTE)
    // ==========================================================================
    function startInlineEdit(bc) {
        const card = bc.element;
        if (card.querySelector('.barcode-inline-edit-box')) return;

        const editBox = document.createElement('div');
        editBox.className = 'barcode-inline-edit-box';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'barcode-inline-input';
        input.value = bc.value;
        editBox.appendChild(input);

        card.appendChild(editBox);
        input.focus();
        input.select();

        function commitChange() {
            const finalVal = input.value.trim();
            if (finalVal) {
                bc.value = bc.format === 'CODE39' ? finalVal.toUpperCase() : finalVal;

                // Attribution automatique du titre en fonction du suffixe du code
                if (bc.value.endsWith('81035')) {
                    bc.title = 'FRAIS';
                } else if (bc.value.endsWith('81025')) {
                    bc.title = 'SURG';
                }

                // Mettre à jour l'élément de titre dans le DOM
                const titleEl = card.querySelector('.barcode-card-title');
                const headerEl = card.querySelector('.barcode-card-header');
                if (titleEl && headerEl) {
                    if (bc.title) {
                        titleEl.textContent = bc.title.toUpperCase();
                        titleEl.classList.remove('hidden');
                        headerEl.classList.remove('hidden');
                    } else {
                        titleEl.textContent = '';
                        titleEl.classList.add('hidden');
                        const dateEl = card.querySelector('.barcode-card-date');
                        if (!dateEl || dateEl.classList.contains('hidden')) {
                            headerEl.classList.add('hidden');
                        }
                    }
                }

                renderBarcodeGraphics(bc);
                saveState();
            }
            editBox.remove();
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitChange();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                editBox.remove();
            }
        });

        input.addEventListener('blur', () => {
            commitChange();
        });
    }

    // ==========================================================================
    // MENU CONTEXTUEL PERSONNALISÉ AU CLIC DROIT CONSTANT
    // ==========================================================================
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('input') || e.target.closest('select')) {
            return;
        }

        e.preventDefault();

        const card = e.target.closest('.draggable-barcode');

        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.classList.remove('hidden');

        if (card) {
            contextMenuTargetId = card.dataset.id;
            selectBarcode(contextMenuTargetId);

            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            const pageSet = getPageSettings(activePage);

            if (bc && bc.isDateOnly && pageSet && pageSet.gridType !== 'free') {
                contextMenu.innerHTML = `
                    <ul>
                        <li onclick="window.triggerContextMenuDelete()" class="menu-danger">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Supprimer
                        </li>
                    </ul>
                `;
            } else {
                const hasTitle = bc && bc.title;
                const showValue = bc && bc.displayValue;

                contextMenu.innerHTML = `
                <ul>
                    <li onclick="window.triggerContextMenuEditTitle()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        ${hasTitle ? 'Modifier le titre' : 'Ajouter un titre'}
                    </li>
                    <li onclick="window.triggerContextMenuEdit()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Modifier le code
                    </li>
                    <li onclick="window.triggerToggleValue()">
                        ${showValue ? `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            Masquer la valeur
                        ` : `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Afficher la valeur
                        `}
                    </li>
                    <li class="menu-submenu">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                        Alignement
                        <ul class="submenu-list">
                            <li onclick="window.alignBarcode('center-h')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"></line><rect x="6" y="8" width="12" height="8" rx="1"></rect></svg>
                                Centrer H. (Milieu)
                            </li>
                            <li onclick="window.alignBarcode('center-v')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12"></line><rect x="8" y="6" width="8" height="12" rx="1"></rect></svg>
                                Centrer V. (Milieu)
                            </li>
                            <li onclick="window.alignBarcode('center-both')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                                Centrer les deux
                            </li>
                            <li class="menu-divider"></li>
                            <li onclick="window.alignBarcode('left')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="2" x2="4" y2="22"></line><rect x="8" y="7" width="12" height="10" rx="1"></rect></svg>
                                Aligner à gauche
                            </li>
                            <li onclick="window.alignBarcode('right')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="20" y1="2" x2="20" y2="22"></line><rect x="4" y="7" width="12" height="10" rx="1"></rect></svg>
                                Aligner à droite
                            </li>
                            <li onclick="window.alignBarcode('top')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="4" x2="22" y2="4"></line><rect x="7" y="8" width="10" height="12" rx="1"></rect></svg>
                                Aligner en haut
                            </li>
                            <li onclick="window.alignBarcode('bottom')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="20" x2="22" y2="20"></line><rect x="7" y="4" width="10" height="12" rx="1"></rect></svg>
                                Aligner en bas
                            </li>
                        </ul>
                    </li>
                    <li onclick="window.triggerContextMenuDuplicate()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Dupliquer
                    </li>
                    <li class="menu-submenu">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                        Changer le format
                        <ul class="submenu-list">
                            <li onclick="window.setBarcodeFormat('CODE128')" ${bc && bc.format === 'CODE128' ? 'class="menu-active"' : ''}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="5" x2="3" y2="19"></line><line x1="8" y1="5" x2="8" y2="19"></line><line x1="12" y1="5" x2="12" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line><line x1="21" y1="5" x2="21" y2="19"></line></svg>
                                CODE128
                                ${bc && bc.format === 'CODE128' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-left: auto; color: var(--primary-color);"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                            </li>
                            <li onclick="window.setBarcodeFormat('EAN13')" ${bc && bc.format === 'EAN13' ? 'class="menu-active"' : ''}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="5" x2="3" y2="19"></line><line x1="8" y1="5" x2="8" y2="19"></line><line x1="12" y1="5" x2="12" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line><line x1="21" y1="5" x2="21" y2="19"></line></svg>
                                EAN-13
                                ${bc && bc.format === 'EAN13' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-left: auto; color: var(--primary-color);"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                            </li>
                            <li onclick="window.setBarcodeFormat('CODE39')" ${bc && bc.format === 'CODE39' ? 'class="menu-active"' : ''}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="5" x2="3" y2="19"></line><line x1="8" y1="5" x2="8" y2="19"></line><line x1="12" y1="5" x2="12" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line><line x1="21" y1="5" x2="21" y2="19"></line></svg>
                                CODE39
                                ${bc && bc.format === 'CODE39' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-left: auto; color: var(--primary-color);"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                            </li>
                        </ul>
                    </li>
                    <li class="menu-divider"></li>
                    <li onclick="window.triggerContextMenuDelete()" class="menu-danger">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Supprimer
                    </li>
                </ul>
            `;
            }
        } else {
            contextMenuTargetId = null;
            const pageBarcodesCount = barcodes.filter(bc => bc.page === activePage).length;
            const isPageEmpty = (pageBarcodesCount === 0);
            const pageSet = getPageSettings(activePage);
            const isDateMode = pageSet && pageSet.isDateMode;

            contextMenu.innerHTML = `
                <ul>
                    ${isDateMode ? `
                        <li onclick="window.triggerUnlockDateMode()" class="menu-danger">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                            </svg>
                            Déverrouiller 🥬
                        </li>
                    ` : `
                        <li onclick="window.triggerFocusInput()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Nouveau code-barres
                        </li>
                    `}
                    <li onclick="window.triggerPrint()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Imprimer la page
                    </li>
                    <li ${isPageEmpty ? 'class="menu-danger menu-disabled"' : 'onclick="window.triggerClearAll()" class="menu-danger"'}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Vider la feuille
                    </li>
                </ul>
            `;
        }

        const menuRect = contextMenu.getBoundingClientRect();
        if (e.clientX + menuRect.width > window.innerWidth) {
            contextMenu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
        }
        if (e.clientY + menuRect.height > window.innerHeight) {
            contextMenu.style.top = `${window.innerHeight - menuRect.height - 8}px`;
        }

        // Basculer la direction du sous-menu en fonction de la moitié verticale de la fenêtre
        if (e.clientY > window.innerHeight / 2) {
            contextMenu.classList.add('submenu-up');
        } else {
            contextMenu.classList.remove('submenu-up');
        }
    });

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
        contextMenuTargetId = null;
        contextMenuTargetPage = null;
    }

    window.triggerContextMenuRenamePage = async () => {
        if (contextMenuTargetPage !== null) {
            const targetPage = contextMenuTargetPage;
            hideContextMenu();
            const pageSet = getPageSettings(targetPage);
            const currentName = (pageSet && pageSet.name) ? pageSet.name : `Page ${targetPage}`;
            const newName = await showCustomPrompt(`Renommer la page`, `Saisissez le nouveau nom de la page :`, currentName);
            if (newName !== null) {
                const trimmed = newName.trim();
                pageSet.name = trimmed || `Page ${targetPage}`;
                saveState();
                renderTabs();
            }
        }
    };

    window.triggerContextMenuDeletePage = () => {
        if (contextMenuTargetPage !== null) {
            const targetPage = contextMenuTargetPage;
            hideContextMenu();
            deletePage(targetPage);
        }
    };

    document.addEventListener('mousedown', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    window.triggerContextMenuEdit = () => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc) startInlineEdit(bc);
        }
        hideContextMenu();
    };

    // ==========================================================================
    // INTERACTION DE LA MODALE PERSONNALISÉE DU TITRE
    // ==========================================================================
    function openTitleModal(bc) {
        currentEditingBarcodeForTitle = bc;
        titleModalInput.value = bc.title || "";
        titleModal.classList.remove('hidden');
        setTimeout(() => {
            titleModalInput.focus();
            titleModalInput.select();
        }, 50);
    }

    function closeTitleModal() {
        titleModal.classList.add('hidden');
        currentEditingBarcodeForTitle = null;
    }

    function saveTitleModalValue() {
        if (currentEditingBarcodeForTitle) {
            const finalTitle = titleModalInput.value.trim();
            currentEditingBarcodeForTitle.title = finalTitle;
            const titleEl = currentEditingBarcodeForTitle.element.querySelector('.barcode-card-title');
            const headerEl = currentEditingBarcodeForTitle.element.querySelector('.barcode-card-header');
            if (titleEl && headerEl) {
                if (finalTitle) {
                    titleEl.textContent = finalTitle.toUpperCase();
                    titleEl.classList.remove('hidden');
                    headerEl.classList.remove('hidden');
                } else {
                    titleEl.textContent = '';
                    titleEl.classList.add('hidden');
                    const dateEl = currentEditingBarcodeForTitle.element.querySelector('.barcode-card-date');
                    if (!dateEl || dateEl.classList.contains('hidden')) {
                        headerEl.classList.add('hidden');
                    }
                }
            }
        }
        closeTitleModal();
        saveState();
    }

    // Écouteurs d'actions des fenêtres modales
    if (btnCloseTitleModal) btnCloseTitleModal.addEventListener('click', closeTitleModal);
    if (btnCancelTitleModal) btnCancelTitleModal.addEventListener('click', closeTitleModal);
    if (btnSaveTitleModal) btnSaveTitleModal.addEventListener('click', saveTitleModalValue);

    if (titleModalInput) {
        titleModalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTitleModalValue();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeTitleModal();
            }
        });
    }

    // Title shortcut badges click handler
    document.querySelectorAll('.title-shortcuts .shortcut-badge').forEach(badge => {
        badge.addEventListener('click', () => {
            if (titleModalInput) {
                titleModalInput.value = badge.dataset.value;
                saveTitleModalValue();
            }
        });
    });

    if (titleModal) {
        titleModal.addEventListener('mousedown', (e) => {
            if (e.target === titleModal) {
                closeTitleModal();
            }
        });
    }

    // Logique et écouteurs du tiroir d'aide
    let helpBtnTooltip = null;
    let helpBtnTooltipTimeout = null;

    function showHelpBtnTooltip(btn) {
        if (helpBtnTooltipTimeout) {
            clearTimeout(helpBtnTooltipTimeout);
        }

        helpBtnTooltipTimeout = setTimeout(() => {
            if (helpBtnTooltip) {
                helpBtnTooltip.remove();
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'input-tooltip tooltip-left';
            tooltip.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Aide & Raccourcis
            `;

            document.body.appendChild(tooltip);
            helpBtnTooltip = tooltip;

            const rect = btn.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX - 12}px`;
            tooltip.style.top = `${rect.top + rect.height / 2 + window.scrollY}px`;
        }, 300);
    }

    function hideHelpBtnTooltip() {
        if (helpBtnTooltipTimeout) {
            clearTimeout(helpBtnTooltipTimeout);
            helpBtnTooltipTimeout = null;
        }
        if (helpBtnTooltip) {
            helpBtnTooltip.remove();
            helpBtnTooltip = null;
        }
    }

    function openHelpModal() {
        if (helpModal) helpModal.classList.remove('hidden');
    }

    function closeHelpModal() {
        if (helpModal) helpModal.classList.add('hidden');
    }

    if (btnHelp) {
        btnHelp.addEventListener('mouseenter', () => showHelpBtnTooltip(btnHelp));
        btnHelp.addEventListener('mouseleave', hideHelpBtnTooltip);
        btnHelp.addEventListener('click', () => {
            hideHelpBtnTooltip();
            openHelpModal();
        });
    }
    if (btnCloseHelpModal) btnCloseHelpModal.addEventListener('click', closeHelpModal);
    if (btnCloseHelpOk) btnCloseHelpOk.addEventListener('click', closeHelpModal);
    if (helpModal) {
        helpModal.addEventListener('mousedown', (e) => {
            if (e.target === helpModal) {
                closeHelpModal();
            }
        });
    }

    window.triggerContextMenuEditTitle = () => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc) openTitleModal(bc);
        }
        hideContextMenu();
    };

    window.triggerToggleValue = () => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc) {
                bc.displayValue = !bc.displayValue;
                renderBarcodeGraphics(bc);
                saveState();
            }
        }
        hideContextMenu();
    };

    window.alignBarcode = (type) => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc && bc.element) {
                if (type === 'center-h') {
                    bc.leftPercent = (100 - bc.cardWidthPercent) / 2;
                } else if (type === 'center-v') {
                    bc.topPercent = (100 - bc.cardHeightPercent) / 2;
                } else if (type === 'center-both') {
                    bc.leftPercent = (100 - bc.cardWidthPercent) / 2;
                    bc.topPercent = (100 - bc.cardHeightPercent) / 2;
                } else if (type === 'left') {
                    bc.leftPercent = 0;
                } else if (type === 'right') {
                    bc.leftPercent = 100 - bc.cardWidthPercent;
                } else if (type === 'top') {
                    bc.topPercent = 0;
                } else if (type === 'bottom') {
                    bc.topPercent = 100 - bc.cardHeightPercent;
                }

                bc.element.style.left = `${bc.leftPercent}%`;
                bc.element.style.top = `${bc.topPercent}%`;
                saveState();
            }
        }
        hideContextMenu();
    };

    window.triggerContextMenuDuplicate = () => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc) {
                addNewBarcode(
                    bc.value,
                    bc.format,
                    bc.cardWidthPercent,
                    bc.cardHeightPercent,
                    bc.height,
                    bc.width,
                    bc.displayValue,
                    bc.title
                );
            }
        }
        hideContextMenu();
    };

    window.setBarcodeFormat = (newFmt) => {
        if (contextMenuTargetId) {
            const bc = barcodes.find(b => b.id === contextMenuTargetId);
            if (bc) {
                bc.format = newFmt;
                renderBarcodeGraphics(bc);
                saveState();
            }
        }
        hideContextMenu();
    };

    window.triggerContextMenuDelete = () => {
        if (contextMenuTargetId) {
            deleteBarcode(contextMenuTargetId);
        }
        hideContextMenu();
    };

    function showValueInputTooltip() {
        if (currentTooltip) {
            currentTooltip.remove();
            currentTooltip = null;
        }
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'input-tooltip';
        tooltip.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-right: 4px;">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Placer ici le code
        `;

        document.body.appendChild(tooltip);
        currentTooltip = tooltip;

        const rect = valueInput.getBoundingClientRect();
        tooltip.style.left = `${rect.right + 12}px`;
        tooltip.style.top = `${rect.top + rect.height / 2}px`;

        tooltipTimeout = setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(-50%) translateX(8px)';
            tooltipTimeout = setTimeout(() => {
                tooltip.remove();
                if (currentTooltip === tooltip) {
                    currentTooltip = null;
                }
            }, 300);
        }, 5000);
    }

    window.triggerFocusInput = () => {
        valueInput.focus();
        showValueInputTooltip();
        hideContextMenu();
    };

    window.triggerPrint = () => {
        btnPrintSheet.click();
        hideContextMenu();
    };

    window.triggerClearAll = async () => {
        hideContextMenu();
        const confirmed = await showCustomConfirm(
            "Vider la page",
            "Voulez-vous vraiment vider tous les codes-barres de cette page ?"
        );
        if (confirmed) {
            clearAllBarcodes();
        }
    };

    window.triggerUnlockDateMode = () => {
        hideContextMenu();
        if (btnUnlockDateMode) {
            btnUnlockDateMode.click();
        }
    };

    // ==========================================================================
    // COPIER / COLLER GLOBAL (COLLAGE DEPUIS LE PRESSE-PAPIERS)
    // ==========================================================================
    document.addEventListener('paste', (e) => {
        // Si l'attention est sur un champ de saisie ou de sélection, laisser le navigateur gérer normalement
        if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
            return;
        }

        e.preventDefault();

        const pageSet = getPageSettings(activePage);
        if (pageSet && pageSet.isDateMode) {
            showCustomAlert("Page bloquée", "Cette page est bloquée en mode date. Pour ajouter un code-barres, changez le modèle ou videz la page.");
            return;
        }

        let limit = Infinity;
        if (pageSet) {
            if (pageSet.gridType === 'grid-12') limit = 12;
            else if (pageSet.gridType === 'grid-24') limit = 24;
            else if (pageSet.gridType === 'grid-8') limit = 8;
            else if (pageSet.gridType === 'grid-14') limit = 14;
        }
        const currentCount = barcodes.filter(b => b.page === activePage).length;
        if (currentCount >= limit) {
            showCustomAlert("Limite atteinte", `Cette grille ne peut pas contenir plus de ${limit} étiquettes.`);
            return;
        }

        // Retrieve plain text content from the clipboard
        const pastedText = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (pastedText) {
            // Si un code-barres est copié localement et sa valeur correspond au texte collé, le dupliquer à l'identique
            if (copiedBarcodeData && pastedText === copiedBarcodeData.value) {
                let offsetLeft = copiedBarcodeData.leftPercent + 4;
                let offsetTop = copiedBarcodeData.topPercent + 4;
                if (offsetLeft + copiedBarcodeData.cardWidthPercent > 100) offsetLeft = 0;
                if (offsetTop + copiedBarcodeData.cardHeightPercent > 100) offsetTop = 15;

                addNewBarcode(
                    copiedBarcodeData.value,
                    copiedBarcodeData.format,
                    copiedBarcodeData.cardWidthPercent,
                    copiedBarcodeData.cardHeightPercent,
                    copiedBarcodeData.height,
                    copiedBarcodeData.width,
                    copiedBarcodeData.displayValue,
                    copiedBarcodeData.title,
                    offsetLeft,
                    offsetTop
                );

                // Mettre à jour les coordonnées stockées pour les décalages successifs lors du collage
                copiedBarcodeData.leftPercent = offsetLeft;
                copiedBarcodeData.topPercent = offsetTop;
            } else {
                // Détecteur heuristique de format pour le collage de texte général
                let detectedFormat = 'CODE128';
                if (/^\d{13}$/.test(pastedText)) {
                    detectedFormat = 'EAN13';
                }
                addNewBarcode(pastedText, detectedFormat);
            }
        }
    });

    // ==========================================================================
    // RACCOURCIS CLAVIER ET VERROUILLAGE SÉCURISÉ DU ZOOM DU NAVIGATEUR
    // ==========================================================================
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        // Ignorer si l'utilisateur est actuellement dans un champ de saisie ou modifiable
        if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
            return;
        }

        // Combinaisons de touches avec Ctrl
        if (e.ctrlKey) {
            if (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0') {
                e.preventDefault();
            }

            // Ctrl + C (Copier)
            if (e.key.toLowerCase() === 'c') {
                if (selectedBarcodeId) {
                    const bc = barcodes.find(b => b.id === selectedBarcodeId);
                    if (bc) {
                        copiedBarcodeData = {
                            value: bc.value,
                            format: bc.format,
                            cardWidthPercent: bc.cardWidthPercent,
                            cardHeightPercent: bc.cardHeightPercent,
                            height: bc.height,
                            width: bc.width,
                            displayValue: bc.displayValue,
                            title: bc.title,
                            leftPercent: bc.leftPercent,
                            topPercent: bc.topPercent
                        };
                        // Synchroniser le presse-papiers du système
                        navigator.clipboard.writeText(bc.value).catch(() => { });
                        e.preventDefault();
                    }
                }
            }
        }

        // Touche Suppr (Supprimer)
        if (e.key === 'Delete' || e.key === 'Del') {
            if (selectedBarcodeId) {
                deleteBarcode(selectedBarcodeId);
                e.preventDefault();
            }
        }
    });

    // ==========================================================================
    // LOGIQUE DE RENDU ET D'INTERACTION DES ONGLETS MULTI-PAGES
    // ==========================================================================
    const workspaceTabs = document.getElementById('workspace-tabs');
    let pageBtnTooltip = null;

    function showPageBtnTooltip(btn) {
        if (pageBtnTooltip) {
            pageBtnTooltip.remove();
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'input-tooltip tooltip-top tooltip-creation';
        tooltip.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px; margin-right: 4px;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Ajouter une page (Max 4)
        `;

        document.body.appendChild(tooltip);
        pageBtnTooltip = tooltip;

        const rect = btn.getBoundingClientRect();
        // Le positionner au-dessus du bouton, au centre
        tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 8}px`;
    }

    function hidePageBtnTooltip() {
        if (pageBtnTooltip) {
            pageBtnTooltip.remove();
            pageBtnTooltip = null;
        }
    }

    let deleteBtnTooltip = null;
    let deleteBtnTooltipTimeout = null;

    function showDeleteBtnTooltip(btn, pageNumber) {
        if (deleteBtnTooltipTimeout) {
            clearTimeout(deleteBtnTooltipTimeout);
        }

        deleteBtnTooltipTimeout = setTimeout(() => {
            if (deleteBtnTooltip) {
                deleteBtnTooltip.remove();
            }

            const pageSet = getPageSettings(pageNumber);
            const pageName = (pageSet && pageSet.name) ? pageSet.name : `Page ${pageNumber}`;

            const tooltip = document.createElement('div');
            tooltip.className = 'input-tooltip tooltip-top';
            tooltip.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Supprimer ${pageName}
        `;

            document.body.appendChild(tooltip);
            deleteBtnTooltip = tooltip;

            const rect = btn.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
            tooltip.style.top = `${rect.top + window.scrollY - 8}px`;
        }, 500);
    }

    function hideDeleteBtnTooltip() {
        if (deleteBtnTooltipTimeout) {
            clearTimeout(deleteBtnTooltipTimeout);
            deleteBtnTooltipTimeout = null;
        }
        if (deleteBtnTooltip) {
            deleteBtnTooltip.remove();
            deleteBtnTooltip = null;
        }
    }

    function renderTabs() {
        if (!workspaceTabs) return;
        workspaceTabs.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const pageSet = getPageSettings(i);
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = `workspace-tab ${i === activePage ? 'active' : ''}`;

            // Onglet : texte
            const pageName = (pageSet && pageSet.name) ? pageSet.name : `Page ${i}`;
            const tabText = document.createElement('span');
            tabText.textContent = pageName;
            tab.appendChild(tabText);

            // Right-click to show custom context menu
            tab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                contextMenuTargetPage = i;

                contextMenu.style.left = `${e.clientX}px`;
                contextMenu.style.top = `${e.clientY}px`;
                contextMenu.classList.remove('hidden');

                contextMenu.innerHTML = `
                    <ul>
                        <li onclick="window.triggerContextMenuRenamePage()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            Renommer la page
                        </li>
                        ${i > 1 ? `
                            <li onclick="window.triggerContextMenuDeletePage()" class="menu-danger">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Supprimer la page
                            </li>
                        ` : ''}
                    </ul>
                `;

                // Ajuster la position
                const menuRect = contextMenu.getBoundingClientRect();
                if (e.clientX + menuRect.width > window.innerWidth) {
                    contextMenu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
                }
                if (e.clientY + menuRect.height > window.innerHeight) {
                    contextMenu.style.top = `${window.innerHeight - menuRect.height - 8}px`;
                }
            });

            // Icône de statut de l'onglet (Mode date / FLEG)
            if (pageSet && pageSet.isDateMode) {
                const flegIcon = document.createElement('span');
                flegIcon.style.fontSize = '12px';
                flegIcon.style.lineHeight = '1';
                flegIcon.style.display = 'block';
                flegIcon.textContent = '🥬';
                tab.appendChild(flegIcon);
            }

            // Cliquer pour changer de page
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.workspace-tab-delete')) return;
                switchPage(i);
            });

            // Ajouter le bouton de suppression pour les pages > 1
            if (i > 1) {
                const delBtn = document.createElement('span');
                delBtn.className = 'workspace-tab-delete';
                delBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 10px; height: 10px; display: block;">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                `;
                delBtn.addEventListener('mouseenter', () => showDeleteBtnTooltip(delBtn, i));
                delBtn.addEventListener('mouseleave', hideDeleteBtnTooltip);
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideDeleteBtnTooltip();
                    deletePage(i);
                });
                tab.appendChild(delBtn);
            }

            workspaceTabs.appendChild(tab);
        }

        // Ajouter le bouton d'ajout de page
        if (totalPages < 4) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn-add-page-tab';
            addBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 14px; height: 14px; display: block;">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            `;
            addBtn.addEventListener('mouseenter', () => showPageBtnTooltip(addBtn));
            addBtn.addEventListener('mouseleave', hidePageBtnTooltip);
            addBtn.addEventListener('click', () => {
                hidePageBtnTooltip();
                addPage();
            });
            workspaceTabs.appendChild(addBtn);
        }
    }

    function showPageToast(pageNum) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        container.innerHTML = '';

        const pageSet = getPageSettings(pageNum);
        const pageName = (pageSet && pageSet.name) ? pageSet.name : `Page ${pageNum}`;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 16px; height: 16px; color: #ffffff; flex-shrink: 0; margin-right: 2px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>${pageName} sélectionnée</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 1250);
    }

    function switchPage(pageNumber) {
        if (pageNumber < 1 || pageNumber > totalPages) return;
        unselectBarcode();
        activePage = pageNumber;

        applyPageSettingsToUI();

        renderTabs();
        showPageToast(pageNumber);
        saveState();
    }

    function addPage() {
        if (totalPages >= 4) return;
        totalPages++;
        pageSettings[totalPages] = { gridType: 'free', showDate: false, dateValue: '', isDateMode: false };
        switchPage(totalPages);
        updatePrintButtonLabel();
        saveState();
    }

    async function deletePage(pageNumber) {
        if (pageNumber === 1) return;
        const pageSet = getPageSettings(pageNumber);
        const pageName = (pageSet && pageSet.name) ? pageSet.name : `Page ${pageNumber}`;
        const confirmed = await showCustomConfirm(
            "Supprimer la page",
            `Voulez-vous vraiment supprimer ${pageName} et toutes ses étiquettes ?`
        );
        if (confirmed) {
            // Supprimer les codes-barres appartenant à cette page
            barcodes = barcodes.filter(bc => bc.page !== pageNumber);

            // Décrémenter les numéros de page pour les pages supérieures à la page supprimée
            barcodes.forEach(bc => {
                if (bc.page > pageNumber) {
                    bc.page--;
                }
            });

            // Décaler les paramètres des pages supérieures à la page supprimée
            for (let p = pageNumber; p < totalPages; p++) {
                pageSettings[p] = pageSettings[p + 1];
            }
            delete pageSettings[totalPages];

            totalPages--;
            if (activePage > totalPages) {
                activePage = totalPages;
            }
            switchPage(activePage);
            updatePrintButtonLabel();
            saveState();
        }
    }

    // ==========================================================================
    // LOGIQUE DE LA BOÎTE MODALE DE SÉLECTION D'IMPRESSION MULTI-PAGES
    // ==========================================================================
    const printModal = document.getElementById('print-modal');
    const btnClosePrintModal = document.getElementById('btn-close-print-modal');
    const btnCancelPrintModal = document.getElementById('btn-cancel-print-modal');
    const btnConfirmPrint = document.getElementById('btn-confirm-print');
    const printPagesList = document.getElementById('print-pages-list');
    const btnSelectAllPages = document.getElementById('btn-select-all-pages');
    const btnDeselectAllPages = document.getElementById('btn-deselect-all-pages');
    const printOutputContainer = document.getElementById('print-output-container');

    function updateConfirmPrintButtonState() {
        if (!btnConfirmPrint) return;
        const checkedCount = document.querySelectorAll('.print-page-checkbox-card input:checked').length;
        btnConfirmPrint.disabled = (checkedCount === 0);
    }

    function openPrintModal() {
        unselectBarcode();
        if (printPagesList) {
            printPagesList.innerHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                const count = barcodes.filter(bc => bc.page === i).length;
                const isCurrent = (i === activePage);
                const pageSet = getPageSettings(i);
                const pageName = (pageSet && pageSet.name) ? pageSet.name : `Page ${i}`;
                const card = document.createElement('div');
                card.className = `print-page-checkbox-card ${isCurrent ? 'selected' : ''}`;
                card.innerHTML = `
                    <input type="checkbox" id="print-chk-page-${i}" value="${i}" ${isCurrent ? 'checked' : ''}>
                    <div class="custom-checkbox-indicator">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" class="checkmark-icon">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <label for="print-chk-page-${i}" style="cursor: pointer; flex: 1; user-select: none;">${pageName} (${count} code${count > 1 ? 's' : ''})</label>
                `;

                // Gérer le clic sur le conteneur de la carte pour basculer la case à cocher
                card.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                        const chk = card.querySelector('input');
                        chk.checked = !chk.checked;
                        chk.dispatchEvent(new Event('change'));
                    }
                });

                const chk = card.querySelector('input');
                chk.addEventListener('change', () => {
                    if (chk.checked) {
                        card.classList.add('selected');
                    } else {
                        card.classList.remove('selected');
                    }
                    updateConfirmPrintButtonState();
                });

                printPagesList.appendChild(card);
            }
        }
        updateConfirmPrintButtonState();
        if (printModal) printModal.classList.remove('hidden');
    }

    function closePrintModal() {
        if (printModal) printModal.classList.add('hidden');
    }

    if (btnClosePrintModal) btnClosePrintModal.addEventListener('click', closePrintModal);
    if (btnCancelPrintModal) btnCancelPrintModal.addEventListener('click', closePrintModal);

    if (btnSelectAllPages) {
        btnSelectAllPages.addEventListener('click', () => {
            document.querySelectorAll('.print-page-checkbox-card').forEach(card => {
                const chk = card.querySelector('input');
                chk.checked = true;
                card.classList.add('selected');
            });
            updateConfirmPrintButtonState();
        });
    }

    if (btnDeselectAllPages) {
        btnDeselectAllPages.addEventListener('click', () => {
            document.querySelectorAll('.print-page-checkbox-card').forEach(card => {
                const chk = card.querySelector('input');
                chk.checked = false;
                card.classList.remove('selected');
            });
            updateConfirmPrintButtonState();
        });
    }

    if (btnConfirmPrint) {
        btnConfirmPrint.addEventListener('click', () => {
            const selectedPages = [];
            document.querySelectorAll('.print-page-checkbox-card input').forEach(chk => {
                if (chk.checked) {
                    selectedPages.push(parseInt(chk.value));
                }
            });

            if (selectedPages.length === 0) {
                alert("Veuillez sélectionner au moins une page à imprimer.");
                return;
            }

            closePrintModal();
            printSelectedPages(selectedPages);
        });
    }

    function printSelectedPages(selectedPages) {
        if (!printOutputContainer) return;
        printOutputContainer.innerHTML = '';

        selectedPages.forEach(pageNum => {
            const sheet = document.createElement('div');
            sheet.className = 'print-sheet';

            // Appliquer la classe de modèle de grille si elle est active
            const pageSet = getPageSettings(pageNum);
            if (pageSet && pageSet.gridType !== 'free') {
                sheet.classList.add(`template-${pageSet.gridType}`);
            }

            const pageBarcodes = barcodes.filter(bc => bc.page === pageNum);

            pageBarcodes.forEach(bc => {
                const card = document.createElement('div');
                card.className = 'draggable-barcode';
                if (bc.isDateOnly) {
                    card.classList.add('date-only-card');
                }

                // Calculer les positions de grille si actives
                let left = bc.leftPercent;
                let top = bc.topPercent;
                let w = bc.cardWidthPercent;
                let h = bc.cardHeightPercent;

                if (pageSet && pageSet.gridType !== 'free') {
                    const gridConfig = getGridConfig(pageSet.gridType);
                    if (gridConfig) {
                        const idx = pageBarcodes.indexOf(bc);
                        if (idx !== -1) {
                            const col = idx % gridConfig.cols;
                            const row = Math.floor(idx / gridConfig.cols);
                            left = col * gridConfig.wPct;
                            top = row * gridConfig.hPct;
                            w = gridConfig.wPct;
                            h = gridConfig.hPct;
                        }
                    }
                }

                card.style.left = `${left}%`;
                card.style.top = `${top}%`;
                card.style.width = `${w}%`;
                card.style.height = `${h}%`;

                // Ajouter l'en-tête avec le titre
                const headerEl = document.createElement('div');
                headerEl.className = 'barcode-card-header';

                const titleEl = document.createElement('span');
                titleEl.className = 'barcode-card-title';
                if (bc.title) {
                    titleEl.textContent = bc.title.toUpperCase();
                } else {
                    titleEl.classList.add('hidden');
                }
                headerEl.appendChild(titleEl);

                const dateEl = document.createElement('span');
                dateEl.className = 'barcode-card-date';
                if (!bc.isDateOnly && pageSet && pageSet.showDate && pageSet.dateValue) {
                    dateEl.textContent = formatDate(pageSet.dateValue);
                } else {
                    dateEl.classList.add('hidden');
                }
                headerEl.appendChild(dateEl);

                if (!bc.title && (bc.isDateOnly || !pageSet || !pageSet.showDate)) {
                    headerEl.classList.add('hidden');
                }
                card.appendChild(headerEl);

                if (bc.isDateOnly) {
                    const dateValEl = document.createElement('div');
                    dateValEl.className = 'date-only-value';
                    dateValEl.textContent = formatDate(bc.value);
                    card.appendChild(dateValEl);
                } else {
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.id = `print_svg_${bc.id}`;
                    card.appendChild(svg);
                }

                sheet.appendChild(card);
            });

            printOutputContainer.appendChild(sheet);

            // Recréer les images de codes-barres à l'intérieur des nouveaux nœuds SVG
            pageBarcodes.forEach(bc => {
                if (bc.isDateOnly) return;
                const svg = sheet.querySelector(`#print_svg_${bc.id}`);
                if (svg) {
                    let drawHeight = bc.height;
                    if (pageSet && pageSet.gridType !== 'free') {
                        const cardRect = svg.parentElement.getBoundingClientRect();
                        drawHeight = Math.max(25, Math.min(120, Math.floor(cardRect.height * 0.45)));
                    }

                    try {
                        JsBarcode(svg, bc.value, {
                            format: bc.format,
                            height: drawHeight,
                            width: bc.width,
                            displayValue: bc.displayValue,
                            background: "transparent",
                            lineColor: "#000000",
                            fontSize: 13,
                            fontWeight: 600,
                            font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                            valid: function (valid) {
                                if (valid) {
                                    const wAttr = svg.getAttribute('width');
                                    const hAttr = svg.getAttribute('height');
                                    if (wAttr && hAttr) {
                                        const cleanW = wAttr.replace(/[^0-9.]/g, '');
                                        const cleanH = hAttr.replace(/[^0-9.]/g, '');
                                        svg.setAttribute('viewBox', `0 0 ${cleanW} ${cleanH}`);
                                        svg.style.width = '100%';
                                        svg.style.height = '100%';
                                        svg.removeAttribute('width');
                                        svg.removeAttribute('height');
                                    }
                                }
                            }
                        });
                    } catch (err) {
                        console.error("Print barcode generation error:", err);
                    }
                }
            });
        });

        setTimeout(() => {
            window.print();
        }, 150);
    }

    window.addEventListener('afterprint', () => {
        if (printOutputContainer) {
            printOutputContainer.innerHTML = '';
        }
    });

    // ==========================================================================
    // LOGIQUE DE SÉLECTION DE GRILLE PERSONNALISÉE
    // ==========================================================================
    const customGridSelect = document.getElementById('custom-grid-select');
    const gridSelect = document.getElementById('page-grid-select');
    if (customGridSelect && gridSelect) {
        const trigger = customGridSelect.querySelector('.custom-select-trigger');
        const triggerText = trigger.querySelector('span');
        const options = customGridSelect.querySelectorAll('.custom-select-option');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            customGridSelect.classList.toggle('active');
        });

        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();

                // Mettre à jour les classes sélectionnées
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');

                // Mettre à jour l'affichage du texte
                triggerText.textContent = opt.textContent;

                // Synchroniser le sélecteur réel masqué et déclencher l'événement change
                gridSelect.value = opt.dataset.value;
                gridSelect.dispatchEvent(new Event('change'));

                customGridSelect.classList.remove('active');
            });
        });

        document.addEventListener('click', () => {
            customGridSelect.classList.remove('active');
        });
    }

    const pageNameInput = document.getElementById('page-name-input');
    if (pageNameInput) {
        pageNameInput.addEventListener('input', () => {
            const pageSet = getPageSettings(activePage);
            const trimmed = pageNameInput.value.trim();
            pageSet.name = trimmed || `Page ${activePage}`;
            saveState();
            renderTabs();
        });

        pageNameInput.addEventListener('blur', () => {
            const pageSet = getPageSettings(activePage);
            if (!pageNameInput.value.trim()) {
                pageNameInput.value = `Page ${activePage}`;
            }
        });
    }

    if (gridSelect) {
        gridSelect.addEventListener('change', () => {
            const pageSet = getPageSettings(activePage);
            pageSet.gridType = gridSelect.value;

            // Limiter les codes-barres à la capacité de la nouvelle grille pour éviter les débordements !
            let limit = Infinity;
            if (pageSet.gridType === 'grid-12') limit = 12;
            else if (pageSet.gridType === 'grid-24') limit = 24;
            else if (pageSet.gridType === 'grid-8') limit = 8;
            else if (pageSet.gridType === 'grid-14') limit = 14;

            const pageBarcodes = barcodes.filter(bc => bc.page === activePage);
            if (pageBarcodes.length > limit) {
                const toKeep = pageBarcodes.slice(0, limit);
                const toRemove = pageBarcodes.slice(limit);

                // Supprimer les éléments du DOM
                toRemove.forEach(bc => {
                    if (bc.element) bc.element.remove();
                });

                // Mettre à jour le tableau global des codes-barres
                barcodes = barcodes.filter(bc => bc.page !== activePage || toKeep.includes(bc));
            }

            applyPageSettingsToUI();
            saveState();
        });
    }

    if (btnGenerateDates) {
        btnGenerateDates.addEventListener('click', () => {
            const dateVal = dateInput.value || today;

            const activeBarcodesCount = barcodes.filter(bc => bc.page === activePage).length;
            if (activeBarcodesCount > 0) {
                showCustomConfirm(
                    "Étiquettes FLEG",
                    "Voulez-vous remplacer les étiquettes de cette page par des étiquettes de date FLEG ?"
                ).then(confirmed => {
                    if (confirmed) {
                        fillPageWithDates(dateVal, 'grid-14');
                    }
                });
            } else {
                fillPageWithDates(dateVal, 'grid-14');
            }
        });
    }
    if (btnUnlockDateMode) {
        btnUnlockDateMode.addEventListener('click', () => {
            showCustomConfirm(
                "Quitter le mode FLEG",
                "Voulez-vous quitter le mode FLEG et réinitialiser cette page ?"
            ).then(confirmed => {
                if (confirmed) {
                    const pageSet = getPageSettings(activePage);
                    if (pageSet) {
                        pageSet.isDateMode = false;
                        pageSet.gridType = 'free';
                    }
                    clearAllBarcodes();
                }
            });
        });
    }

    function fillPageWithDates(dateVal, gridType) {
        clearAllBarcodes();

        const pageSet = getPageSettings(activePage);
        if (pageSet) {
            pageSet.isDateMode = true;
            pageSet.dateValue = dateVal;
            pageSet.gridType = gridType;
        }

        let count = 0;
        if (gridType === 'grid-12') count = 12;
        else if (gridType === 'grid-24') count = 24;
        else if (gridType === 'grid-8') count = 8;
        else if (gridType === 'grid-14') count = 14;
        else count = 1; // mode libre

        let w = 34;
        let h = 11;
        const gridConfig = getGridConfig(gridType);
        if (gridConfig) {
            w = gridConfig.wPct;
            h = gridConfig.hPct;
        }

        for (let i = 0; i < count; i++) {
            addNewBarcode(dateVal, 'CODE128', w, h, 55, 2, true, '', null, null, activePage, true);
        }

        applyPageSettingsToUI();
        renderTabs();
        saveState();
    }

    if (dateInput) {
        dateInput.value = today;
        dateInput.addEventListener('change', () => {
            const pageSet = getPageSettings(activePage);
            pageSet.dateValue = dateInput.value;

            // Synchroniser toutes les étiquettes de date de la page active
            barcodes.forEach(bc => {
                if (bc.page === activePage && bc.isDateOnly) {
                    bc.value = dateInput.value;
                    const dateValEl = bc.element ? bc.element.querySelector('.date-only-value') : null;
                    if (dateValEl) {
                        dateValEl.textContent = formatDate(bc.value);
                    }
                }
            });

            saveState();
        });
    }

    function applyPageSettingsToUI() {
        const pageSet = getPageSettings(activePage);

        // Mettre à jour le champ de saisie du nom de la page
        const pageNameInput = document.getElementById('page-name-input');
        if (pageNameInput) {
            pageNameInput.value = pageSet.name || `Page ${activePage}`;
        }

        // Mettre à jour la valeur de sélection de la grille
        if (gridSelect) {
            gridSelect.value = pageSet.gridType;
            if (customGridSelect) {
                const triggerText = customGridSelect.querySelector('.custom-select-trigger span');
                const options = customGridSelect.querySelectorAll('.custom-select-option');
                const targetOpt = Array.from(options).find(opt => opt.dataset.value === pageSet.gridType);
                if (targetOpt) {
                    options.forEach(o => o.classList.remove('selected'));
                    targetOpt.classList.add('selected');
                    if (triggerText) triggerText.textContent = targetOpt.textContent;
                }

                // Bloquer les modifications de grille si la page est en mode date
                if (pageSet.isDateMode) {
                    customGridSelect.style.opacity = '0.5';
                    customGridSelect.style.pointerEvents = 'none';
                    customGridSelect.setAttribute('title', "Changez de mode pour modifier le gabarit.");
                } else {
                    customGridSelect.style.opacity = '1';
                    customGridSelect.style.pointerEvents = 'auto';
                    customGridSelect.removeAttribute('title');
                }
            }
        }

        // Mettre à jour le champ de saisie de date
        if (dateInput) {
            dateInput.value = pageSet.dateValue || today;
        }

        // Mettre à jour le statut du mode date et l'état du bouton d'ajout
        const statusEl = document.getElementById('date-mode-status');
        if (statusEl) {
            statusEl.style.display = pageSet.isDateMode ? 'flex' : 'none';
        }

        if (btnAddBarcode) {
            if (pageSet.isDateMode) {
                btnAddBarcode.style.opacity = '0.5';
                btnAddBarcode.style.pointerEvents = 'none';
                btnAddBarcode.setAttribute('title', "Cette page est bloquée en mode date.");
            } else {
                btnAddBarcode.style.opacity = '1';
                btnAddBarcode.style.pointerEvents = 'auto';
                btnAddBarcode.removeAttribute('title');
            }
        }

        if (valueInput) {
            if (pageSet.isDateMode) {
                valueInput.disabled = true;
                valueInput.style.opacity = '0.5';
                valueInput.setAttribute('title', "Cette page est bloquée en mode date.");
            } else {
                valueInput.disabled = false;
                valueInput.style.opacity = '1';
                valueInput.removeAttribute('title');
            }
        }

        if (customFormatSelect) {
            if (pageSet.isDateMode) {
                customFormatSelect.style.opacity = '0.5';
                customFormatSelect.style.pointerEvents = 'none';
                customFormatSelect.setAttribute('title', "Cette page est bloquée en mode date.");
            } else {
                customFormatSelect.style.opacity = '1';
                customFormatSelect.style.pointerEvents = 'auto';
                customFormatSelect.removeAttribute('title');
            }
        }

        // Appliquer la classe de modèle de grille à la feuille
        if (printSheet) {
            printSheet.className = 'print-sheet';
            if (pageSet.gridType !== 'free') {
                printSheet.classList.add(`template-${pageSet.gridType}`);
            }
        }

        // Redessiner tous les codes-barres de la page active
        document.querySelectorAll('.draggable-barcode').forEach(card => card.remove());
        barcodes.forEach(bc => {
            if (bc.page === activePage) {
                createBarcodeDOM(bc);
            }
        });

        updatePlaceholder();
    }



    function setupCustomDatePicker() {
        const customDatePicker = document.getElementById('custom-datepicker');
        const calendarDropdown = document.getElementById('datepicker-calendar');
        if (!dateInput || !calendarDropdown) return;

        // Déplacer le calendrier dans le body pour éviter le rognage par la barre latérale
        document.body.appendChild(calendarDropdown);

        // Surcharge de la date sur le champ de saisie pour garder le format ISO (AAAA-MM-JJ) dans la propriété
        // mais afficher le format européen (JJ/MM/AAAA) dans la vue.
        let _dateValue = today;
        Object.defineProperty(dateInput, 'value', {
            get() {
                return _dateValue;
            },
            set(val) {
                // Si le format est déjà JJ/MM/AAAA, le convertir en AAAA-MM-JJ
                let isoValue = val;
                if (val && val.includes('/')) {
                    const parts = val.split('/');
                    if (parts.length === 3) {
                        isoValue = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                }
                _dateValue = isoValue;

                // Set HTML attribute and internal DOM value
                dateInput.setAttribute('value', isoValue);
                const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

                // Formater pour l'affichage : JJ/MM/AAAA
                let displayVal = isoValue;
                if (isoValue && isoValue.includes('-')) {
                    const parts = isoValue.split('-');
                    if (parts.length === 3) {
                        displayVal = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                }
                nativeValueSetter.call(dateInput, displayVal);
            },
            configurable: true
        });

        // Initialiser la valeur par défaut
        dateInput.value = today;

        let currentDate = new Date(); // suit le mois/année affiché dans le calendrier

        function parseCurrentInputDate() {
            const val = _dateValue || today;
            const parts = val.split('-');
            if (parts.length === 3) {
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            }
            return new Date();
        }

        function renderCalendar() {
            calendarDropdown.innerHTML = '';

            const selectedDate = parseCurrentInputDate();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            // Noms des mois en français
            const monthsFR = [
                "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
            ];

            // 1. En-tête
            const header = document.createElement('div');
            header.className = 'calendar-header';

            const title = document.createElement('span');
            title.className = 'calendar-title';
            title.textContent = `${monthsFR[month]} ${year}`;
            header.appendChild(title);

            const navBtns = document.createElement('div');
            navBtns.className = 'calendar-nav-buttons';

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'calendar-nav-btn';
            prevBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderCalendar();
            });
            navBtns.appendChild(prevBtn);

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'calendar-nav-btn';
            nextBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentDate.setMonth(currentDate.getMonth() + 1);
                renderCalendar();
            });
            navBtns.appendChild(nextBtn);

            header.appendChild(navBtns);
            calendarDropdown.appendChild(header);

            // 2. Libellés des jours de la semaine
            const weekdays = document.createElement('div');
            weekdays.className = 'calendar-weekdays';
            const dayLabels = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
            dayLabels.forEach(lbl => {
                const dayEl = document.createElement('span');
                dayEl.className = 'calendar-weekday';
                dayEl.textContent = lbl;
                weekdays.appendChild(dayEl);
            });
            calendarDropdown.appendChild(weekdays);

            // 3. Grille des jours
            const daysGrid = document.createElement('div');
            daysGrid.className = 'calendar-days';

            // Premier jour du mois
            const firstDay = new Date(year, month, 1);
            // En JavaScript getDay() renvoie 0=Dimanche, 1=Lundi ... 6=Samedi
            // Convertir en 0=Lundi ... 6=Dimanche
            let firstDayIdx = (firstDay.getDay() + 6) % 7;

            // Jours du mois en cours
            const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
            // Jours du mois précédent
            const totalDaysInPrevMonth = new Date(year, month, 0).getDate();

            // Jours restants du mois précédent
            for (let i = firstDayIdx - 1; i >= 0; i--) {
                const dayVal = totalDaysInPrevMonth - i;
                const cell = document.createElement('div');
                cell.className = 'calendar-day other-month';
                cell.textContent = dayVal;
                daysGrid.appendChild(cell);
            }

            // Jours du mois en cours
            const todayObj = new Date();
            for (let i = 1; i <= totalDaysInMonth; i++) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                cell.textContent = i;

                // Marquer le jour sélectionné
                if (
                    selectedDate.getDate() === i &&
                    selectedDate.getMonth() === month &&
                    selectedDate.getFullYear() === year
                ) {
                    cell.classList.add('selected');
                }

                // Marquer aujourd'hui
                if (
                    todayObj.getDate() === i &&
                    todayObj.getMonth() === month &&
                    todayObj.getFullYear() === year
                ) {
                    cell.classList.add('today');
                }

                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const formattedM = (month + 1).toString().padStart(2, '0');
                    const formattedD = i.toString().padStart(2, '0');
                    const newIsoVal = `${year}-${formattedM}-${formattedD}`;

                    dateInput.value = newIsoVal;
                    dateInput.dispatchEvent(new Event('change'));
                    calendarDropdown.classList.add('hidden');
                });

                daysGrid.appendChild(cell);
            }

            // Jours du mois suivant pour compléter la grille de 42 cellules (6 lignes)
            const totalCells = daysGrid.children.length;
            const remainingCells = 42 - totalCells;
            for (let i = 1; i <= remainingCells; i++) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day other-month';
                cell.textContent = i;
                daysGrid.appendChild(cell);
            }

            calendarDropdown.appendChild(daysGrid);

            // 4. Pied de page
            const footer = document.createElement('div');
            footer.className = 'calendar-footer';

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'calendar-footer-btn';
            clearBtn.textContent = 'Effacer';
            clearBtn.style.visibility = 'hidden'; // Conserver la mise en page mais masquer
            footer.appendChild(clearBtn);

            const todayBtn = document.createElement('button');
            todayBtn.type = 'button';
            todayBtn.className = 'calendar-footer-btn';
            todayBtn.textContent = "Aujourd'hui";
            todayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const now = new Date();
                const formattedM = (now.getMonth() + 1).toString().padStart(2, '0');
                const formattedD = now.getDate().toString().padStart(2, '0');
                const newIsoVal = `${now.getFullYear()}-${formattedM}-${formattedD}`;

                currentDate = new Date();
                dateInput.value = newIsoVal;
                dateInput.dispatchEvent(new Event('change'));
                calendarDropdown.classList.add('hidden');
            });
            footer.appendChild(todayBtn);

            calendarDropdown.appendChild(footer);
        }

        // Basculer la visibilité du calendrier déroulant
        dateInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (calendarDropdown.classList.contains('hidden')) {
                currentDate = parseCurrentInputDate();
                renderCalendar();

                // Positionner par rapport au champ de saisie
                const rect = dateInput.getBoundingClientRect();
                calendarDropdown.style.left = `${rect.right + 12}px`;
                calendarDropdown.style.top = `${rect.top + rect.height / 2}px`;
                calendarDropdown.style.transform = 'translateY(-50%)';

                calendarDropdown.classList.remove('hidden');
            } else {
                calendarDropdown.classList.add('hidden');
            }
        });

        // Masquer le calendrier lors d'un clic en dehors
        document.addEventListener('click', (e) => {
            if (
                customDatePicker &&
                !customDatePicker.contains(e.target) &&
                !calendarDropdown.contains(e.target)
            ) {
                calendarDropdown.classList.add('hidden');
            }
        });
    }

    // Pré-remplir l'espace de travail A4 avec les codes-barres sauvegardés, ou un code de démo centré à l'initialisation si vide
    if (!loadState()) {
        addNewBarcode("AUCHAN-35002", "CODE128");
    }
    applyPageSettingsToUI();
    renderTabs();
    updatePrintButtonLabel();
});
