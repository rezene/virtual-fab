// webview.js
import BpmnJS from 'bpmn-js/lib/Modeler';

// Import necessary core modules
import PaletteModule from 'bpmn-js/lib/features/palette';
import ModelingModule from 'bpmn-js/lib/features/modeling';
import ContextPadModule from 'bpmn-js/lib/features/context-pad';



// Import Properties Panel Modules
// User confirmed this import is correct:
import {
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
  } from 'bpmn-js-properties-panel';


// Removed direct CSS imports - they should be linked in the HTML head

// Acquire the VS Code API instance early
const vscode = acquireVsCodeApi();

let bpmnModeler; // Variable to hold the BpmnJS instance

/**
 * Loads the BPMN XML diagram into the editor.
 * @param {string} xml - The BPMN XML content.
 */
async function loadDiagram(xml) { // Made async to use await for importXML
    // Check if the modeler instance exists
    if (!bpmnModeler) {
        console.error('BpmnJS modeler not initialized.');
        vscode.postMessage({ command: 'error', message: 'BPMN modeler failed to initialize.' });
        return;
    }

    try {
        // Import the XML into the modeler
        const result = await bpmnModeler.importXML(xml); // Use await as importXML returns a Promise
        console.log('XML loaded successfully!', result);

        // Access the canvas module and fit the diagram to the viewport
        const canvas = bpmnModeler.get('canvas');
        canvas.zoom('fit-viewport');

    } catch (err) {
        // Log and report errors during XML import
        console.error('Error loading XML', err);
        vscode.postMessage({ command: 'error', message: 'Failed to load BPMN diagram: ' + err.message });
    }
}


// --- Initialization ---

// Wait for the DOM to be fully loaded before getting elements and instantiating BpmnJS
document.addEventListener('DOMContentLoaded', async () => { // <-- Wrap your initialization code

    // Get the container elements from the HTML *after* the DOM is ready
    // Use the IDs defined in your HTML (_getWebviewContent)
    const diagramContainer = document.getElementById('canvas'); // Get the diagram container by ID
    const propertiesPanelContainer = document.getElementById('properties-panel-container'); // Get the properties panel container by ID

    // Add checks to ensure containers were found
    if (!diagramContainer) {
        console.error('Webview: Diagram container #canvas not found!');
        vscode.postMessage({ command: 'error', message: 'Failed to initialize BPMN editor: Diagram container #canvas not found.' });
        return; // Stop execution if essential element is missing
    }

    // Properties panel container is needed only if properties panel modules are included
    if (BpmnPropertiesPanelModule && BpmnPropertiesProviderModule && !propertiesPanelContainer) {
        console.warn('Webview: Properties panel modules included, but container #properties-panel-container not found.');
        // Decide if you want to proceed without properties panel or stop
        // For now, we'll log a warning and proceed if the diagram container exists.
        // If properties panel is mandatory, add 'return' here.
    }


    // Create a new BpmnJS Modeler instance now that containers are confirmed to exist (or checked)
    bpmnModeler = new BpmnJS({
        container: diagramContainer, // Pass the actual DOM element reference
        propertiesPanel: {
            parent: propertiesPanelContainer // Pass the actual DOM element reference (might be null if container not found)
        },
        // Include necessary modules
        additionalModules: [
            PaletteModule,
            ModelingModule,
            ContextPadModule,


            // Include Properties Panel Modules
            BpmnPropertiesPanelModule,
            BpmnPropertiesProviderModule

        ],
        // Configuration options
        keyboard: { // Example: Bind keyboard events if needed
          bindTo: document // Or window
        }
    });

    console.log('BpmnJS Modeler initialized.');

    // --- Event Listeners ---

    // Listener for when the diagram content changes
    // Ensure this is defined after bpmnModeler is initialized
    bpmnModeler.on('commandStack.changed', debounce(async () => { // Made async to use await
        if (!bpmnModeler) {
    return;
 } // Add check if needed
        try {
            // Save the current diagram as XML
            const { xml } = await bpmnModeler.saveXML({ format: true }); // Use await and destructuring
            // Send the updated XML back to the VS Code extension
            vscode.postMessage({ command: 'saveXml', xml: xml });
            console.log('Webview: Sent saveXml command.');
        } catch (err) {
            // Log and report errors during XML saving
            console.error('Error saving XML', err);
            vscode.postMessage({ command: 'error', message: 'Failed to save BPMN XML: ' + err.message });
        }
    }, 300)); // Debounce

    // --- Communication with VS Code Extension ---

    // Listen for messages from the VS Code extension
    // This listener is kept outside DOMContentLoaded to ensure it's registered immediately.
    // Its handler ('loadDiagram') checks if bpmnModeler is ready.


    // Notify the extension that the webview is ready *after* BpmnJS is initialized
    // and the DOM is ready to receive the initial XML.
    vscode.postMessage({ command: 'ready' });

}); // <-- End of DOMContentLoaded listener


// The message listener is kept outside DOMContentLoaded to ensure it's registered immediately.
// Its handler ('loadDiagram') checks if bpmnModeler is ready.
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