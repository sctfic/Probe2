// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/

function createCodeEditor(textareaId, autoCompletions = []) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) {
        console.error(`Textarea with id "${textareaId}" not found`);
        return;
    }

    // Créer le container
    const container = document.createElement('div');
    container.className = 'code-editor-container';
    
    // Récupérer les styles de la textarea originale
    const originalStyles = getComputedStyle(textarea);
    container.style.width = originalStyles.width;
    container.style.height = originalStyles.height;
    
    // Copier d'autres propriétés importantes si elles existent
    if (originalStyles.maxWidth !== 'none') container.style.maxWidth = originalStyles.maxWidth;
    if (originalStyles.maxHeight !== 'none') container.style.maxHeight = originalStyles.maxHeight;
    if (originalStyles.minWidth !== '0px') container.style.minWidth = originalStyles.minWidth;
    if (originalStyles.minHeight !== '0px') container.style.minHeight = originalStyles.minHeight;

    // Créer l'élément de highlight
    const highlightDiv = document.createElement('pre');
    highlightDiv.className = 'code-editor-highlight hljs';

    // Créer la nouvelle textarea
    const newTextarea = textarea.cloneNode(true);
    newTextarea.className = 'code-editor-textarea';

    // Créer l'autocomplétion
    const autocompleteDiv = document.createElement('div');
    autocompleteDiv.className = 'code-editor-autocomplete';

    // Créer le texte fantôme pour l'autocomplétion
    const ghostTextDiv = document.createElement('div');
    ghostTextDiv.className = 'code-editor-ghost-text';

    // Remplacer l'ancienne textarea
    textarea.parentNode.replaceChild(container, textarea);
    container.appendChild(highlightDiv);
    container.appendChild(newTextarea);
    container.appendChild(autocompleteDiv);
    container.appendChild(ghostTextDiv);

    let selectedIndex = -1;

    // Fonction de mise à jour du highlight
    function updateHighlight() {
        const code = newTextarea.value;
        const highlightedCode = hljs.highlightAuto(code).value || code;
        
        // Pas besoin d'ajouter de ligne vide, le padding uniforme règle le problème
        highlightDiv.innerHTML = highlightedCode;
    }

    // Fonction de gestion de l'indentation
    function handleIndentation(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            
            // Si l'autocomplétion est visible, valider la première suggestion
            if (autocompleteDiv.style.display === 'block') {
                const selectedItem = autocompleteDiv.querySelector('.code-editor-autocomplete-item.selected');
                if (selectedItem) {
                    selectedItem.click();
                    return;
                }
            }
            
            const start = newTextarea.selectionStart;
            const end = newTextarea.selectionEnd;
            const value = newTextarea.value;
            
            // Gestion de la sélection multiligne
            if (start !== end) {
                const selectedText = value.substring(start, end);
                const lines = selectedText.split('\n');
                
                if (e.shiftKey) {
                    // Désindentation multiligne
                    const unindentedLines = lines.map(line => {
                        if (line.startsWith('    ')) {
                            return line.substring(4);
                        } else if (line.startsWith('\t')) {
                            return line.substring(1);
                        }
                        return line;
                    });
                    const newSelectedText = unindentedLines.join('\n');
                    newTextarea.value = value.substring(0, start) + newSelectedText + value.substring(end);
                    newTextarea.selectionStart = start;
                    newTextarea.selectionEnd = start + newSelectedText.length;
                } else {
                    // Indentation multiligne
                    const indentedLines = lines.map(line => '    ' + line);
                    const newSelectedText = indentedLines.join('\n');
                    newTextarea.value = value.substring(0, start) + newSelectedText + value.substring(end);
                    newTextarea.selectionStart = start;
                    newTextarea.selectionEnd = start + newSelectedText.length;
                }
                updateHighlight();
                return;
            }
            
            // Indentation simple ligne
            if (e.shiftKey) {
                // Désindentation
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineText = value.substring(lineStart, start);
                if (lineText.startsWith('    ')) {
                    newTextarea.value = value.substring(0, lineStart) + 
                                       lineText.substring(4) + 
                                       value.substring(start);
                    newTextarea.selectionStart = newTextarea.selectionEnd = start - 4;
                } else if (lineText.startsWith('\t')) {
                    newTextarea.value = value.substring(0, lineStart) + 
                                       lineText.substring(1) + 
                                       value.substring(start);
                    newTextarea.selectionStart = newTextarea.selectionEnd = start - 1;
                }
            } else {
                // Indentation
                newTextarea.value = value.substring(0, start) + '    ' + value.substring(end);
                newTextarea.selectionStart = newTextarea.selectionEnd = start + 4;
            }
            updateHighlight();
        }
        
        if (e.key === 'Enter') {
            // Auto-indentation
            setTimeout(() => {
                const start = newTextarea.selectionStart;
                const value = newTextarea.value;
                const prevLineStart = value.lastIndexOf('\n', start - 2) + 1;
                const prevLineEnd = value.indexOf('\n', prevLineStart);
                const prevLine = value.substring(prevLineStart, prevLineEnd !== -1 ? prevLineEnd : value.length);
                const indentMatch = prevLine.match(/^(\s*)/);
                
                if (indentMatch) {
                    const indent = indentMatch[1];
                    const beforeCursor = value.substring(0, start);
                    const afterCursor = value.substring(start);
                    
                    newTextarea.value = beforeCursor + indent + afterCursor;
                    newTextarea.selectionStart = newTextarea.selectionEnd = start + indent.length;
                    updateHighlight();
                }
            }, 0);
        }
    }

    // Fonction de gestion des commentaires
    function toggleComment(e) {
        if (e.ctrlKey && e.key === '/') {
            e.preventDefault();
            
            const start = newTextarea.selectionStart;
            const end = newTextarea.selectionEnd;
            const value = newTextarea.value;
            
            // Gestion de la sélection multiligne
            if (start !== end) {
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = value.indexOf('\n', end - 1);
                const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
                
                const selectedLines = value.substring(lineStart, actualLineEnd);
                const lines = selectedLines.split('\n');
                
                // Vérifier si toutes les lignes sont commentées
                const allCommented = lines.every(line => {
                    const trimmed = line.trim();
                    return trimmed === '' || trimmed.startsWith('//');
                });
                
                const processedLines = lines.map(line => {
                    const indent = line.match(/^(\s*)/)[1];
                    const lineContent = line.substring(indent.length);
                    
                    if (allCommented) {
                        // Décommenter
                        if (lineContent.startsWith('// ')) {
                            return indent + lineContent.substring(3);
                        } else if (lineContent.startsWith('//')) {
                            return indent + lineContent.substring(2);
                        }
                        return line;
                    } else {
                        // Commenter
                        if (lineContent.trim() === '') return line;
                        return indent + '// ' + lineContent;
                    }
                });
                
                const newSelectedText = processedLines.join('\n');
                newTextarea.value = value.substring(0, lineStart) + newSelectedText + value.substring(actualLineEnd);
                newTextarea.selectionStart = lineStart;
                newTextarea.selectionEnd = lineStart + newSelectedText.length;
            } else {
                // Ligne simple
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = value.indexOf('\n', start);
                const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
                
                const line = value.substring(lineStart, actualLineEnd);
                const indent = line.match(/^(\s*)/)[1];
                const lineContent = line.substring(indent.length);
                
                let newLine;
                let cursorOffset = 0;
                
                if (lineContent.startsWith('// ')) {
                    newLine = indent + lineContent.substring(3);
                    cursorOffset = -3;
                } else if (lineContent.startsWith('//')) {
                    newLine = indent + lineContent.substring(2);
                    cursorOffset = -2;
                } else {
                    newLine = indent + '// ' + lineContent;
                    cursorOffset = 3;
                }
                
                newTextarea.value = value.substring(0, lineStart) + newLine + value.substring(actualLineEnd);
                newTextarea.selectionStart = newTextarea.selectionEnd = start + cursorOffset;
            }
            
            updateHighlight();
        }
    }

    // Fonction d'autocomplétion améliorée
    function showAutocomplete() {
        if (autoCompletions.length === 0) return;

        const cursorPos = newTextarea.selectionStart;
        const value = newTextarea.value;
        const wordStart = Math.max(0, 
            Math.max(
                value.lastIndexOf(' ', cursorPos - 1),
                value.lastIndexOf('\n', cursorPos - 1),
                value.lastIndexOf('\t', cursorPos - 1),
                value.lastIndexOf('(', cursorPos - 1),
                value.lastIndexOf('[', cursorPos - 1),
                value.lastIndexOf('{', cursorPos - 1),
                value.lastIndexOf('.', cursorPos - 1)
            ) + 1
        );
        const currentWord = value.substring(wordStart, cursorPos);

        if (currentWord.length < 2) {
            hideAutocomplete();
            hideGhostText();
            return;
        }

        // Filtrer les suggestions qui incluent le mot courant
        const matches = autoCompletions.filter(completion => 
            completion.toLowerCase().includes(currentWord.toLowerCase())
        ).slice(0, 10); // Limiter à 10 suggestions

        if (matches.length === 0) {
            hideAutocomplete();
            hideGhostText();
            return;
        }

        // Afficher le texte fantôme pour la première suggestion
        showGhostText(matches[0], currentWord, wordStart, cursorPos);

        // Construire la liste d'autocomplétion
        autocompleteDiv.innerHTML = '';
        matches.forEach((match, index) => {
            const item = document.createElement('div');
            item.className = 'code-editor-autocomplete-item';
            if (index === 0) item.classList.add('selected');
            
            // Mettre en évidence le texte correspondant
            const before = match.substring(0, currentWord.length);
            const after = match.substring(currentWord.length);
            
            item.innerHTML = '<strong>' + before + '</strong>' + after;
            
            item.addEventListener('click', () => insertCompletion(match, wordStart, cursorPos));
            autocompleteDiv.appendChild(item);
        });

        // Positionner l'autocomplétion sous la ligne courante
        positionAutocomplete(cursorPos);
        autocompleteDiv.style.display = 'block';
        selectedIndex = 0;
    }

    function positionAutocomplete(cursorPos) {
        const value = newTextarea.value;
        const beforeCursor = value.substring(0, cursorPos);
        const lines = beforeCursor.split('\n');
        const currentLineIndex = lines.length - 1;
        
        // Calculer la position avec le padding uniforme
        const lineHeight = parseInt(getComputedStyle(newTextarea).lineHeight) || 21;
        const padding = 20; // Correspond au padding-left défini dans le CSS
        const topPosition = (currentLineIndex + 1) * lineHeight - newTextarea.scrollTop;
        
        // Position horizontale basée sur la longueur de la ligne courante
        const currentLine = lines[currentLineIndex];
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = getComputedStyle(newTextarea).font;
        const textWidth = context.measureText(currentLine).width;
        
        autocompleteDiv.style.left = Math.min(padding + textWidth * 0.6, container.offsetWidth - 200) + 'px';
        autocompleteDiv.style.top = Math.max(topPosition, 0) + 'px';
    }

    function showGhostText(completion, currentWord, wordStart, cursorPos) {
        const value = newTextarea.value;
        const beforeCursor = value.substring(0, wordStart);
        const ghostCompletion = completion.substring(currentWord.length);
        
        // Gérer les snippets avec positionnement du curseur
        let finalCompletion = ghostCompletion;
        const cursorMarker = '|';
        
        if (ghostCompletion.includes(cursorMarker)) {
            finalCompletion = ghostCompletion.replace(cursorMarker, '');
        }
        
        // Calculer la position exacte du curseur
        const lines = beforeCursor.split('\n');
        const currentLineIndex = lines.length - 1;
        const currentLineStart = beforeCursor.lastIndexOf('\n') + 1;
        const currentLineText = beforeCursor.substring(currentLineStart) + currentWord;
        
        // Créer le contenu du ghost text avec la bonne position
        let ghostContent = '';
        
        console.log(currentLineIndex);
        // Ajouter les lignes vides pour atteindre la ligne courante
        for (let i = 0; i < currentLineIndex; i++) {
            ghostContent += '\n';
        }
        
        // Ajouter le texte de la ligne courante + la complétion
        ghostContent += currentLineText + finalCompletion;
        
        // ajoute des ligne vide pour correspondre au nombre de ligne du textarea
        ghostContent += '\n'.repeat(value.split('\n').length - ghostContent.split('\n').length +1);

        ghostTextDiv.textContent = ghostContent;
        ghostTextDiv.style.display = 'block';

        ghostTextDiv.scrollTop = newTextarea.scrollTop;
        ghostTextDiv.scrollLeft = newTextarea.scrollLeft;
    }

    function hideGhostText() {
        ghostTextDiv.style.display = 'none';
    }

    function hideAutocomplete() {
        autocompleteDiv.style.display = 'none';
        hideGhostText();
        selectedIndex = -1;
    }

    function insertCompletion(completion, wordStart, cursorPos) {
        const value = newTextarea.value;
        
        // Gérer les snippets avec positionnement du curseur
        const cursorMarker = '|';
        let finalCompletion = completion;
        let cursorOffset = completion.length;
        
        if (completion.includes(cursorMarker)) {
            const markerIndex = completion.indexOf(cursorMarker);
            finalCompletion = completion.replace(cursorMarker, '');
            cursorOffset = markerIndex;
        }
        
        // Gérer l'indentation pour les snippets multilignes
        if (finalCompletion.includes('\n')) {
            const beforeWord = value.substring(0, wordStart);
            const currentLineStart = beforeWord.lastIndexOf('\n') + 1;
            const currentIndent = beforeWord.substring(currentLineStart).match(/^(\s*)/)[1];
            
            // Indenter chaque ligne du snippet (sauf la première)
            const lines = finalCompletion.split('\n');
            const indentedLines = lines.map((line, index) => {
                if (index === 0) return line;
                return currentIndent + line;
            });
            finalCompletion = indentedLines.join('\n');
        }
        
        newTextarea.value = value.substring(0, wordStart) + finalCompletion + value.substring(cursorPos);
        
        // Positionner le curseur
        const newCursorPos = wordStart + cursorOffset;
        newTextarea.selectionStart = newTextarea.selectionEnd = newCursorPos;
        
        hideAutocomplete();
        updateHighlight();
        newTextarea.focus();
    }

    function handleAutocompleteNavigation(e) {
        const items = autocompleteDiv.querySelectorAll('.code-editor-autocomplete-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateAutocompleteSelection();
            updateGhostTextFromSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateAutocompleteSelection();
            updateGhostTextFromSelection();
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            items[selectedIndex].click();
        } else if (e.key === 'Escape') {
            hideAutocomplete();
        }
    }

    function updateGhostTextFromSelection() {
        const items = autocompleteDiv.querySelectorAll('.code-editor-autocomplete-item');
        if (selectedIndex >= 0 && items[selectedIndex]) {
            const cursorPos = newTextarea.selectionStart;
            const value = newTextarea.value;
            const wordStart = Math.max(0, 
                Math.max(
                    value.lastIndexOf(' ', cursorPos - 1),
                    value.lastIndexOf('\n', cursorPos - 1),
                    value.lastIndexOf('\t', cursorPos - 1),
                    value.lastIndexOf('(', cursorPos - 1),
                    value.lastIndexOf('[', cursorPos - 1),
                    value.lastIndexOf('{', cursorPos - 1),
                    value.lastIndexOf('.', cursorPos - 1)
                ) + 1
            );
            const currentWord = value.substring(wordStart, cursorPos);
            const selectedCompletion = items[selectedIndex].textContent;
            
            showGhostText(selectedCompletion, currentWord, wordStart, cursorPos);
        }
    }

    function updateAutocompleteSelection() {
        const items = autocompleteDiv.querySelectorAll('.code-editor-autocomplete-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
        
        // Scroll automatique dans la liste
        const selectedItem = items[selectedIndex];
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    // Synchronisation du scroll améliorée
    function syncScroll() {
        highlightDiv.scrollTop = newTextarea.scrollTop;
        highlightDiv.scrollLeft = newTextarea.scrollLeft;
        
        // Le ghost text doit suivre exactement le même scroll
        ghostTextDiv.scrollTop = newTextarea.scrollTop;
        ghostTextDiv.scrollLeft = newTextarea.scrollLeft;
        
        // Mettre à jour la position de l'autocomplétion si elle est visible
        if (autocompleteDiv.style.display === 'block') {
            positionAutocomplete(newTextarea.selectionStart);
        }
    }

    // Event listeners
    newTextarea.addEventListener('input', () => {
        updateHighlight();
        showAutocomplete();
    });

    newTextarea.addEventListener('keydown', (e) => {
        toggleComment(e);
        handleIndentation(e);
        if (autocompleteDiv.style.display === 'block') {
            handleAutocompleteNavigation(e);
        }
    });

    newTextarea.addEventListener('scroll', syncScroll);
    
    newTextarea.addEventListener('blur', () => {
        setTimeout(hideAutocomplete, 200); // Délai pour permettre les clics
    });

    // Fermer l'autocomplétion en cliquant ailleurs
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            hideAutocomplete();
        }
    });

    // Gestion du redimensionnement
    const resizeObserver = new ResizeObserver(() => {
        syncScroll();
    });
    resizeObserver.observe(container);

    // Initialisation
    updateHighlight();

    return {
        textarea: newTextarea,
        container: container,
        updateHighlight: updateHighlight,
        addCompletions: function(newCompletions) {
            autoCompletions.push(...newCompletions);
        },
        setCompletions: function(newCompletions) {
            autoCompletions.length = 0;
            autoCompletions.push(...newCompletions);
        }
    };
}