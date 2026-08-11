document.addEventListener('DOMContentLoaded', () => {
    // Array to hold active barcode objects
    let barcodes = [];
    let selectedBarcodeId = null;
    let barcodeIdCounter = 0;

    // Multipage state
    let totalPages = 1;
    let activePage = 1;

    // Target DOM Nodes
    const printSheet = document.getElementById('print-sheet');
    const sheetPlaceholder = document.getElementById('sheet-placeholder');

    // Sidebar forms
    const valueInput = document.getElementById('barcode-value-input');
    const formatSelect = document.getElementById('barcode-format-select');
    const btnAddBarcode = document.getElementById('btn-add-barcode');
    // General action buttons
    const btnPrintSheet = document.getElementById('btn-print-sheet');
    const btnClearSheet = document.getElementById('btn-clear-sheet');

    // Custom context menu container
    const contextMenu = document.getElementById('custom-context-menu');

    // Title modal DOM references
    const titleModal = document.getElementById('title-modal');
    const titleModalInput = document.getElementById('title-modal-input');
    const btnCloseTitleModal = document.getElementById('btn-close-title-modal');
    const btnCancelTitleModal = document.getElementById('btn-cancel-title-modal');
    const btnSaveTitleModal = document.getElementById('btn-save-title-modal');
    let currentEditingBarcodeForTitle = null;

    // Help modal DOM references
    const helpModal = document.getElementById('help-modal');
    const btnHelp = document.getElementById('btn-help');
    const btnCloseHelpModal = document.getElementById('btn-close-help-modal');
    const btnCloseHelpOk = document.getElementById('btn-close-help-ok');

    // Sheets saved counter reference
    const sheetsSavedText = document.getElementById('sheets-saved-text');
    const sheetsSavedEcoDetails = document.getElementById('sheets-saved-eco-details');

    let activeDragElement = null;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let contextMenuTargetId = null; // Stored barcode ID for context actions
    let copiedBarcodeData = null; // Stored barcode configuration for copy-pasting
    let currentTooltip = null;
    let tooltipTimeout = null;

    // ==========================================================================
    // CUSTOM SELECT DROPDOWN LOGIC
    // ==========================================================================
    const customSelect = document.getElementById('custom-format-select');
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
                
                // Update selected classes
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');

                // Update text display
                triggerText.textContent = opt.textContent;

                // Sync the actual hidden select and dispatch change event
                if (realSelect) {
                    realSelect.value = opt.dataset.value;
                    realSelect.dispatchEvent(new Event('change'));
                }

                customSelect.classList.remove('active');
            });
        });

        // Sync custom UI if real select value is modified programmatically
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

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            customSelect.classList.remove('active');
        });
    }

    // ==========================================================================
    // ACTION TRIGGERS & FORM HANDLERS
    // ==========================================================================

    btnAddBarcode.addEventListener('click', () => {
        const val = valueInput.value.trim();
        const format = formatSelect.value;
        if (!val) return;

        addNewBarcode(val, format);
        valueInput.value = ''; // Reset input after insertion
    });

    valueInput.addEventListener('input', () => {
        // Remove tooltip if active when user starts typing
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

    // Main barcode generation handler using percentage sizing for matching scale
    function addNewBarcode(value, format, cardWPct = 34, cardHPct = 11, height = 55, width = 2, displayValue = true, title = "", leftPercent = null, topPercent = null, page = null) {
        barcodeIdCounter++;
        const id = `bc_${Date.now()}_${barcodeIdCounter}`;

        const finalPage = page !== null ? page : activePage;

        // Cascade positions, centering the default card horizontally on the sheet
        const count = barcodes.filter(b => b.page === finalPage).length;
        const finalLeft = leftPercent !== null ? leftPercent : (100 - cardWPct) / 2; // Perfectly centered by default
        const finalTop = topPercent !== null ? topPercent : (15 + (count * 12) % 50);

        let finalTitle = title;
        if (!finalTitle && leftPercent === null) {
            const cleanVal = format === 'CODE39' ? value.toUpperCase() : value;
            if (cleanVal.endsWith('81035')) {
                finalTitle = "FRAIS";
            } else if (cleanVal.endsWith('81025')) {
                finalTitle = "SURG";
            }
        }

        const bcObj = {
            id,
            value: format === 'CODE39' ? value.toUpperCase() : value,
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
            element: null
        };

        if (finalPage === activePage) {
            createBarcodeDOM(bcObj);
        }
        barcodes.push(bcObj);
        if (finalPage === activePage) {
            selectBarcode(id);
        }

        updatePlaceholder();
    }

    // ==========================================================================
    // DOM BARCODE CARD INITIALIZATION & RENDER
    // ==========================================================================
    function createBarcodeDOM(bc) {
        const card = document.createElement('div');
        card.className = 'draggable-barcode';
        card.style.left = `${bc.leftPercent}%`;
        card.style.top = `${bc.topPercent}%`;
        card.style.width = `${bc.cardWidthPercent}%`;
        card.style.height = `${bc.cardHeightPercent}%`;
        card.dataset.id = bc.id;

        // Custom Title Label at the top of the card
        const titleEl = document.createElement('div');
        titleEl.className = 'barcode-card-title';
        if (bc.title) {
            titleEl.textContent = bc.title.toUpperCase();
        } else {
            titleEl.classList.add('hidden');
        }
        card.appendChild(titleEl);

        // Vector SVG canvas
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = `svg_${bc.id}`;
        card.appendChild(svg);



        // Resize bottom-right handle
        const resizer = document.createElement('div');
        resizer.className = 'barcode-resize-handle';
        card.appendChild(resizer);

        printSheet.appendChild(card);
        bc.element = card;

        // Draw barcodes
        renderBarcodeGraphics(bc);

        // Card mouse click events
        card.addEventListener('mousedown', (e) => {
            selectBarcode(bc.id);
        });
        card.addEventListener('touchstart', (e) => {
            selectBarcode(bc.id);
        });

        // Double-click triggers superimposed edit input
        card.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startInlineEdit(bc);
        });

        // Resizer mouse drag triggers using parent sheet relative percentages
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

                // Align grid snapping
                const gridSpacing = 15;
                newWidth = Math.round(newWidth / gridSpacing) * gridSpacing;
                newHeight = Math.round(newHeight / gridSpacing) * gridSpacing;

                let pctWidth = (newWidth / parentRect.width) * 100;
                let pctHeight = (newHeight / parentRect.height) * 100;

                // Ensure the card width and height do not extend beyond the sheet boundaries
                const maxAllowedWidthPct = 100 - bc.leftPercent;
                const maxAllowedHeightPct = 100 - bc.topPercent;

                pctWidth = Math.min(pctWidth, maxAllowedWidthPct);
                pctHeight = Math.min(pctHeight, maxAllowedHeightPct);

                card.style.width = `${pctWidth}%`;
                card.style.height = `${pctHeight}%`;

                bc.cardWidthPercent = pctWidth;
                bc.cardHeightPercent = pctHeight;

                // Adjust barcode internal heights based on relative scale
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

        // Init drag movement
        initDragAndDrop(card);
    }

    // Render JsBarcode with vector aspect ratios mapping
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
    // DRAG AND DROP MOVEMENT LOGIC (PERCENTAGE POSITIONING)
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

            activeDragElement = element;
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
            const snapTolerance = 25; // Larger tolerance for sheet edges

            // Apply edge-snapping tolerance to ensure perfect flush alignment at boundaries
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

    async function deleteBarcode(id) {
        const idx = barcodes.findIndex(b => b.id === id);
        if (idx !== -1) {
            const confirmed = await showCustomConfirm(
                "Supprimer l'étiquette",
                "Voulez-vous vraiment supprimer cette étiquette de code-barres ?"
            );
            if (confirmed) {
                const bc = barcodes[idx];
                if (bc.element) {
                    bc.element.remove();
                }
                barcodes.splice(idx, 1);
                if (selectedBarcodeId === id) {
                    unselectBarcode();
                }
                updatePlaceholder();
            }
        }
    }

    function clearAllBarcodes() {
        // Only clear current page's barcodes
        barcodes.forEach(bc => {
            if (bc.page === activePage && bc.element) {
                bc.element.remove();
            }
        });
        barcodes = barcodes.filter(bc => bc.page !== activePage);
        unselectBarcode();
        updatePlaceholder();
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

    function updateSheetsCounter() {
        if (!sheetsSavedText) return;
        const count = barcodes.length;
        const savedCount = Math.max(0, count - totalPages);

        if (savedCount === 0 || savedCount === 1) {
            sheetsSavedText.textContent = `${savedCount} feuille sauvée`;
        } else {
            sheetsSavedText.textContent = `${savedCount} feuilles sauvées`;
        }

        if (sheetsSavedEcoDetails) {
            const trees = (savedCount * 0.003).toFixed(3).replace('.', ',');
            const water = savedCount * 10;
            const treeLabel = (savedCount * 0.003) >= 2 ? "arbres sauvés" : "arbre sauvé";
            sheetsSavedEcoDetails.textContent = `${trees} ${treeLabel} • ${water}L d'eau`;
        }
    }

    function saveState() {
        const state = {
            totalPages,
            activePage,
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
                page: bc.page || 1
            }))
        };
        localStorage.setItem('easybar_state_v2', JSON.stringify(state));
    }

    function loadState() {
        let saved = localStorage.getItem('easybar_state_v2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                totalPages = parsed.totalPages || 1;
                activePage = parsed.activePage || 1;
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
                console.error("Error loading saved state v2:", e);
            }
        }

        // Migrate from legacy format
        saved = localStorage.getItem('easybar_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    totalPages = 1;
                    activePage = 1;
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
        if (pageBarcodes.length > 0) {
            sheetPlaceholder.classList.add('hidden');
        } else {
            sheetPlaceholder.classList.remove('hidden');
        }

        if (btnClearSheet) {
            btnClearSheet.disabled = (pageBarcodes.length === 0);
        }

        updateSheetsCounter();
        saveState();
    }

    // ==========================================================================
    // INLINE EDITING INTERACTION (DOUBLE-CLICK / MODIFIER TEXTE)
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

                // Automatic title assignment based on code suffix
                if (bc.value.endsWith('81035')) {
                    bc.title = 'FRAIS';
                } else if (bc.value.endsWith('81025')) {
                    bc.title = 'SURG';
                }

                // Update title element on the DOM
                const titleEl = card.querySelector('.barcode-card-title');
                if (titleEl) {
                    if (bc.title) {
                        titleEl.textContent = bc.title.toUpperCase();
                        titleEl.classList.remove('hidden');
                    } else {
                        titleEl.textContent = '';
                        titleEl.classList.add('hidden');
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
    // CUSTOM CONSTANT RIGHT-CLICK CONTEXT MENU
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
        } else {
            contextMenuTargetId = null;
            const pageBarcodesCount = barcodes.filter(bc => bc.page === activePage).length;
            const isPageEmpty = (pageBarcodesCount === 0);
            contextMenu.innerHTML = `
                <ul>
                    <li onclick="window.triggerFocusInput()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Nouveau code-barres
                    </li>
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

        // Toggle submenu direction depending on viewport vertical half
        if (e.clientY > window.innerHeight / 2) {
            contextMenu.classList.add('submenu-up');
        } else {
            contextMenu.classList.remove('submenu-up');
        }
    });

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
        contextMenuTargetId = null;
    }

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
    // TITLE CUSTOM MODAL INTERACTION
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
            if (titleEl) {
                if (finalTitle) {
                    titleEl.textContent = finalTitle.toUpperCase();
                    titleEl.classList.remove('hidden');
                } else {
                    titleEl.textContent = '';
                    titleEl.classList.add('hidden');
                }
            }
        }
        closeTitleModal();
        saveState();
    }

    // Modal Action Listeners
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

    // Help Modal Logic & Listeners
    function openHelpModal() {
        if (helpModal) helpModal.classList.remove('hidden');
    }

    function closeHelpModal() {
        if (helpModal) helpModal.classList.add('hidden');
    }

    if (btnHelp) btnHelp.addEventListener('click', openHelpModal);
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

    // ==========================================================================
    // GLOBAL COPIER / COLLER (CLIPBOARD PASTE)
    // ==========================================================================
    document.addEventListener('paste', (e) => {
        // If focused on an input or select element, let the browser handle it normally
        if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
            return;
        }

        e.preventDefault();

        // Retrieve plain text content from the clipboard
        const pastedText = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (pastedText) {
            // If we have a local copied barcode and its value matches the pasted clipboard text, duplicate it exactly
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

                // Update stored coordinates for successive pasting offsets
                copiedBarcodeData.leftPercent = offsetLeft;
                copiedBarcodeData.topPercent = offsetTop;
            } else {
                // Heuristic format detector for general text paste
                let detectedFormat = 'CODE128';
                if (/^\d{13}$/.test(pastedText)) {
                    detectedFormat = 'EAN13';
                }
                addNewBarcode(pastedText, detectedFormat);
            }
        }
    });

    // ==========================================================================
    // KEYBOARD SHORTCUTS & SECURE BROWSER ZOOM LOCKING
    // ==========================================================================
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        // Ignore if user is currently inside an input or editable field
        if (e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) {
            return;
        }

        // Ctrl key combinations
        if (e.ctrlKey) {
            if (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0') {
                e.preventDefault();
            }

            // Ctrl + C (Copy)
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
                        // Sync system clipboard
                        navigator.clipboard.writeText(bc.value).catch(() => { });
                        e.preventDefault();
                    }
                }
            }
        }

        // Delete key (Suppr)
        if (e.key === 'Delete' || e.key === 'Del') {
            if (selectedBarcodeId) {
                deleteBarcode(selectedBarcodeId);
                e.preventDefault();
            }
        }
    });

    // ==========================================================================
    // MULTIPAGE TABS RENDERING & INTERACTION LOGIC
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
        // Position it above the button, centered
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

            const tooltip = document.createElement('div');
            tooltip.className = 'input-tooltip tooltip-top';
            tooltip.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Supprimer la Page ${pageNumber}
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
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = `workspace-tab ${i === activePage ? 'active' : ''}`;

            // Tab text
            const tabText = document.createElement('span');
            tabText.textContent = `Page ${i}`;
            tab.appendChild(tabText);

            // Click to switch page
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.workspace-tab-delete')) return;
                switchPage(i);
            });

            // Add delete button for pages > 1
            if (i > 1) {
                const delBtn = document.createElement('span');
                delBtn.className = 'workspace-tab-delete';
                delBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 15px; height: 15px; display: block;">
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

        // Add page button
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

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 16px; height: 16px; color: #ffffff; flex-shrink: 0; margin-right: 2px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Page ${pageNum} sélectionnée</span>
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

        // Remove all current barcode DOM elements
        document.querySelectorAll('.draggable-barcode').forEach(card => card.remove());

        // Re-create DOM elements for new active page
        barcodes.forEach(bc => {
            if (bc.page === activePage) {
                createBarcodeDOM(bc);
            }
        });

        renderTabs();
        updatePlaceholder();
        showPageToast(pageNumber);
    }

    function addPage() {
        if (totalPages >= 4) return;
        totalPages++;
        switchPage(totalPages);
        updatePrintButtonLabel();
    }

    async function deletePage(pageNumber) {
        if (pageNumber === 1) return;
        const confirmed = await showCustomConfirm(
            "Supprimer la page",
            `Voulez-vous vraiment supprimer la Page ${pageNumber} et toutes ses étiquettes ?`
        );
        if (confirmed) {
            // Remove barcodes belonging to this page
            barcodes = barcodes.filter(bc => bc.page !== pageNumber);

            // Decrement page numbers for pages higher than the deleted page
            barcodes.forEach(bc => {
                if (bc.page > pageNumber) {
                    bc.page--;
                }
            });

            totalPages--;
            if (activePage > totalPages) {
                activePage = totalPages;
            }
            switchPage(activePage);
            updatePrintButtonLabel();
        }
    }

    // ==========================================================================
    // MULTIPAGE PRINT SELECTION MODAL LOGIC
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
                const card = document.createElement('div');
                card.className = `print-page-checkbox-card ${isCurrent ? 'selected' : ''}`;
                card.innerHTML = `
                    <input type="checkbox" id="print-chk-page-${i}" value="${i}" ${isCurrent ? 'checked' : ''}>
                    <div class="custom-checkbox-indicator">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" class="checkmark-icon">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <label for="print-chk-page-${i}" style="cursor: pointer; flex: 1; user-select: none;">Page ${i} (${count} code${count > 1 ? 's' : ''})</label>
                `;

                // Handle click on card wrapper to toggle checkbox
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

            const pageBarcodes = barcodes.filter(bc => bc.page === pageNum);
            pageBarcodes.forEach(bc => {
                const card = document.createElement('div');
                card.className = 'draggable-barcode';
                card.style.left = `${bc.leftPercent}%`;
                card.style.top = `${bc.topPercent}%`;
                card.style.width = `${bc.cardWidthPercent}%`;
                card.style.height = `${bc.cardHeightPercent}%`;

                if (bc.title) {
                    const titleEl = document.createElement('div');
                    titleEl.className = 'barcode-card-title';
                    titleEl.textContent = bc.title.toUpperCase();
                    card.appendChild(titleEl);
                }

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.id = `print_svg_${bc.id}`;
                card.appendChild(svg);
                sheet.appendChild(card);
            });

            printOutputContainer.appendChild(sheet);

            // Re-render barcode images inside the newly created SVG nodes
            pageBarcodes.forEach(bc => {
                const svg = sheet.querySelector(`#print_svg_${bc.id}`);
                if (svg) {
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

    // Prepopulate A4 workspace with saved barcodes, or one centered demo barcode on init if empty
    if (!loadState()) {
        addNewBarcode("AUCHAN-35002", "CODE128");
    }
    renderTabs();
    updatePrintButtonLabel();
});
