// webview.js
import BpmnJS from 'bpmn-js/lib/Modeler';

// Import necessary modules. Note: PaletteProvider is part of PaletteModule.
import PaletteModule from 'bpmn-js/lib/features/palette';
import ModelingModule from 'bpmn-js/lib/features/modeling';
import ContextPadModule from 'bpmn-js/lib/features/context-pad';

// Removed direct CSS imports - they will be linked in the HTML

// Acquire the VS Code API instance
const vscode = acquireVsCodeApi();
let bpmnModeler; // Variable to hold the BpmnJS instance

/**
 * Loads the BPMN XML diagram into the editor.
 * @param {string} xml - The BPMN XML content.
 */
function loadDiagram(xml) {
    // Check if the modeler instance exists
    if (!bpmnModeler) {
        console.error('BpmnJS modeler not initialized.');
        vscode.postMessage({ command: 'error', message: 'BPMN modeler failed to initialize.' });
        return;
    }

    // Import the XML into the modeler
    bpmnModeler.importXML(xml)
        .then(() => {
            console.log('XML loaded successfully!');
            // Access the canvas module and fit the diagram to the viewport
            const canvas = bpmnModeler.get('canvas');
            canvas.zoom('fit-viewport');
        })
        .catch(err => {
            // Log and report errors during XML import
            console.error('Error loading XML', err);
            vscode.postMessage({ command: 'error', message: 'Failed to load BPMN diagram: ' + err.message });
        });
}

// --- Initialization ---

// Get the container element from the HTML
const container = document.getElementById('container');

// Check if the container exists before initializing BpmnJS
if (container) {
    // Create a new BpmnJS Modeler instance
    bpmnModeler = new BpmnJS({
        container: container, // The DOM element to render the diagram in
        // Include necessary modules for modeling, palette, and context pad
        // DO NOT include PaletteProvider explicitly here, PaletteModule handles it.
        additionalModules: [
            PaletteModule,
            ModelingModule,
            ContextPadModule
        ],
        // Configuration for the palette (optional)
        // palette: {
        //     position: 'left' // Example: Default is top-left, can be changed
        // }
        // keyboard: { // Example: Bind keyboard events if needed
        //   bindTo: window
        // }
    });

    console.log('BpmnJS Modeler initialized.');

    // --- Event Listeners ---

    // Listener for when the diagram content changes
    bpmnModeler.on('commandStack.changed', debounce(() => {
        // Save the current diagram as XML
        bpmnModeler.saveXML({ format: true }).then(({ xml }) => {
            // Send the updated XML back to the VS Code extension
            vscode.postMessage({ command: 'saveXml', xml: xml });
        }).catch(err => {
            // Log and report errors during XML saving
            console.error('Error saving XML', err);
            vscode.postMessage({ command: 'error', message: 'Failed to save BPMN XML: ' + err.message });
        });
    }, 300)); // Debounce to avoid excessive saving during rapid changes

    // --- Communication with VS Code Extension ---

    // Listen for messages from the VS Code extension
    window.addEventListener('message', event => {
        const message = event.data; // The message payload
        console.log('Message received from extension:', message.command);
        switch (message.command) {
            case 'loadXml':
                // Load the diagram when requested by the extension
                loadDiagram(message.xml);
                break;
            // Add other cases as needed
        }
    });

    // Notify the extension that the webview is ready
    vscode.postMessage({ command: 'ready' });

} else {
    // Report error if the container element is missing
    console.error('Container element #container not found in the DOM.');
    vscode.postMessage({ command: 'error', message: 'Webview container element not found.' });
}


// --- Utility Functions ---

/**
 * Debounces a function to limit the rate at which it's called.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce delay in milliseconds.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        // Clear the previous timeout
        clearTimeout(timeout);
        // Set a new timeout
        timeout = setTimeout(() => {
            // Execute the function after the wait time
            func.apply(context, args);
        }, wait);
    };
}
