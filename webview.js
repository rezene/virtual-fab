// media/webview.js
import BpmnJS from "bpmn-js/lib/Modeler";

// Import necessary core modules
import PaletteModule from "bpmn-js/lib/features/palette";
import ModelingModule from "bpmn-js/lib/features/modeling";
import ContextPadModule from "bpmn-js/lib/features/context-pad";

// Import properties panel modules
import {
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,

} from "bpmn-js-properties-panel";

import camundaModdle from 'camunda-bpmn-moddle/resources/camunda';

// Import Camunda moddle extension JSON definition directly
// This path is based on the camunda-bpmn-moddle README example
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json';

// Import BpmnModdle for type hinting or if needed for specific operations,
// but primarily we access it via bpmnModeler.get('moddle')
// import BpmnModdle from 'bpmn-moddle'; // Uncomment if you need to instantiate separately

// Import additional modules
import BpmnColorPickerModule from "bpmn-js-color-picker";
import {
    CreateAppendAnythingModule,
    CreateAppendElementTemplatesModule,
} from "bpmn-js-create-append-anything";
import { ElementTemplatesCoreModule } from "bpmn-js-element-templates";
import TokenSimulationModule from "bpmn-js-token-simulation";

// Removed direct CSS imports - they should be linked in the HTML head

// Acquire the VS Code API instance early
const vscode = acquireVsCodeApi();

let bpmnModeler; // Variable to hold the BpmnJS instance
let propertiesPanel; // Variable to hold the PropertiesPanel instance
let currentElement = null; // Track the currently selected BPMN element object


/**
 * Loads the BPMN XML diagram into the editor.
 * @param {string} xml - The BPMN XML content.
 */
async function loadDiagram(xml) {
    // Check if the modeler instance exists
    if (!bpmnModeler) {
        console.error("BpmnJS modeler not initialized.");
        vscode.postMessage({
            command: "error",
            message: "BPMN modeler failed to initialize.",
        });
        return;
    }

    try {
        // Import the XML into the modeler
        const result = await bpmnModeler.importXML(xml);
        console.log("XML loaded successfully!", result);

        // Access the canvas module and fit the diagram to the viewport
        const canvas = bpmnModeler.get("canvas");
        canvas.zoom("fit-viewport");

        // After loading, select the start event or first element to show properties
        const elementRegistry = bpmnModeler.get('elementRegistry');
        const startEvent = elementRegistry.find(el => el.type === 'bpmn:StartEvent');
        if (startEvent) {
            const selection = bpmnModeler.get('selection');
            selection.select(startEvent);
        }

    } catch (err) {
        // Log and report errors during XML import
        console.error("Error loading XML", err);
        vscode.postMessage({
            command: "error",
            message: "Failed to load BPMN diagram: " + err.message,
        });
    }
}

// --- Initialization ---

// Wait for the DOM to be fully loaded before getting elements and instantiating BpmnJS
document.addEventListener("DOMContentLoaded", async () => {

    // Get the container elements from the HTML *after* the DOM is ready
    const diagramContainer = document.getElementById("canvas");
    const propertiesPanelContainer = document.getElementById(
        "properties-panel-container"
    ); // Container for standard properties
    const dslPropertiesPanelContainer = document.getElementById(
        "properties-panel-container-dsl"
    ); // Container for your custom DSL properties


    if (!diagramContainer) {
        console.error("Webview: Diagram container #canvas not found!");
        vscode.postMessage({
            command: "error",
            message:
                "Failed to initialize BPMN editor: Diagram container #canvas not found.",
        });
        return; // Stop execution if essential element is missing
    }

    // Create a new BpmnJS Modeler instance now that containers are confirmed to exist
    bpmnModeler = new BpmnJS({
        container: diagramContainer, // Pass the actual DOM element reference
        propertiesPanel: {
            parent: propertiesPanelContainer, // Pass the actual DOM element reference for standard properties
        },
        // Include necessary modules
        additionalModules: [
            PaletteModule,
            ModelingModule,
            ContextPadModule,
            BpmnPropertiesPanelModule, // Standard properties panel module
            BpmnPropertiesProviderModule, // Standard BPMN properties provider
            BpmnColorPickerModule,
            CreateAppendAnythingModule,
            CreateAppendElementTemplatesModule,
            ElementTemplatesCoreModule,
            TokenSimulationModule,
            // Add any other necessary modules here
        ],
        // Configure moddle extensions to understand Camunda BPMN elements
        moddleExtensions: {
          camunda: camundaModdleDescriptor // Use the imported JSON descriptor
        },
        // Configuration options
        keyboard: {
            bindTo: document,
        },
        // You might need to configure the properties provider with element templates here
        // elementTemplates: {
        //     provider: new YourElementTemplatesProvider() // If you have a custom provider
        // }
    });

    console.log("BpmnJS Modeler initialized.");

    // --- Instantiate and Connect Properties Panel ---
    // The BpmnJS constructor with propertiesPanel config already handles instantiation
    // and basic connection. We just need to ensure the container exists.
    if (propertiesPanelContainer) {
        // The properties panel instance is usually accessible via the modeler's modules
        // or implicitly managed by the propertiesPanel configuration.
        // For direct access if needed later, you might get it like this:
        // propertiesPanel = bpmnModeler.get('propertiesPanel');
        console.log("Standard properties panel container found and configured.");
    } else {
        console.warn("Standard properties panel container #properties-panel-container not found. Properties panel will not be displayed.");
    }


    // --- Event Listeners ---
    // Listener for when the diagram content changes
    bpmnModeler.on(
        "commandStack.changed",
        debounce(async () => {
            if (!bpmnModeler) {
                return;
            }
            try {
                // Save the current diagram as XML
                const { xml } = await bpmnModeler.saveXML({ format: true });
                // Send the updated XML back to the VS Code extension
                vscode.postMessage({ command: "saveXml", xml: xml });
                console.log("Webview: Sent saveXml command.");
            } catch (err) {
                // Log and report errors during XML saving
                console.error("Error saving XML", err);
                vscode.postMessage({
                    command: "error",
                    message: "Failed to save BPMN XML: " + err.message,
                });
            }
        }, 300)
    );

    // Listener for element selection changes
    bpmnModeler.on('selection.changed', (event) => {
        const selectedElements = event.newSelection;
        const element = selectedElements.length > 0 ? selectedElements[0] : null;

        // Update the global currentElement variable
        currentElement = element;

        if (element) {
            console.log('Webview: Element selected:', element.id, element.type);

            // The standard properties panel is automatically updated by bpmn-js-properties-panel
            // when the 'selection.changed' event occurs, provided it was correctly configured
            // during modeler instantiation.

            // --- Your Custom DSL Panel Logic ---
            // Update your custom DSL panel with the selected element's information
            const elementId = element.id;
            // Retrieve the associated DSL code for this element from the BPMN XML using moddle
            const associatedDslCode = getDslCodeForElement(element);

            // Send message to extension that an element was selected (includes DSL code)
            vscode.postMessage({
                type: 'bpmnElementSelected',
                elementId: elementId,
                dslCode: associatedDslCode
            });

        } else {
            console.log('Webview: No element selected.');
            // Clear the standard properties panel (if you have direct access or rely on its internal handling)
            // If using the standard properties panel, it should clear itself when selection is empty.

            // Also clear your custom DSL panel
            updateDslPanel('', ''); // Implement updateDslPanel to clear your UI
             // Clear diagnostics when no element is selected
             displayDiagnostics([]);
        }
    });


    // --- Communication with VS Code Extension ---
    // Listen for messages from the VS Code extension
    // This listener is kept outside DOMContentLoaded to ensure it's registered immediately.
    // Its handler ('loadDiagram') checks if bpmnModeler is ready.
    window.addEventListener("message", async (event) => { // Made async to handle loadDiagram
        const message = event.data; // The message payload
        console.log("Message received from extension:", message.command);
        switch (message.command) {
            case "loadXml": // Load the diagram when requested by the extension
                await loadDiagram(message.xml); // Use await
                break;
            case 'updatePropertyPanel':
                console.log('Webview: Received updatePropertyPanel message.');
                // This message is primarily used to update your custom DSL panel
                // with the DSL code retrieved by the extension.
                updateDslPanel(message.elementId, message.dslCode);
                break;
            case 'updateDslDiagnostics':
                console.log('Webview: Received updateDslDiagnostics message.');
                // This message contains diagnostics from the LSP server for the DSL code.
                displayDiagnostics(message.diagnostics);
                break;
            // Add other cases as needed
        }
    });


    // Notify the extension that the webview is ready *after* BpmnJS is initialized
    // and the DOM is ready to receive the initial XML.
    vscode.postMessage({ command: "ready" });
}); // <-- End of DOMContentLoaded listener


// --- Your Custom DSL Panel Elements and Logic ---
// Get references to your custom DSL panel elements
const dslCodeTextarea = document.getElementById('dsl-code-textarea');
const elementIdDisplay = document.getElementById('element-id-display');
const diagnosticsDisplay = document.getElementById('dsl-diagnostics');

// Function to update the custom DSL property panel UI
function updateDslPanel(elementId, dslCode) {
    // currentElementId is now tracked by the global currentElement variable
    elementIdDisplay.textContent = elementId ? `Selected Element ID: ${elementId}` : '';
    dslCodeTextarea.value = dslCode || '';
    // Diagnostics are updated by the 'updateDslDiagnostics' message,
    // so we don't clear them here.
    // diagnosticsDisplay.innerHTML = ''; // Clear previous diagnostics if you want to clear on selection change
}


// --- Handle changes in the DSL property panel text box ---
// Listen for input changes in your custom DSL text area
if (dslCodeTextarea) { // Ensure the element exists before adding listener
    dslCodeTextarea.addEventListener('input', () => {
        const newDslCode = dslCodeTextarea.value;
        console.log('Webview: DSL code input:', newDslCode);

        // Update the BPMN model with the new DSL code
        if (currentElement) {
             updateDslCodeForElement(currentElement, newDslCode);
        }


        if (currentElement) {
            // Send message to extension that DSL code changed for LSP diagnostics
            vscode.postMessage({
                command: 'dslCodeChanged',
                elementId: currentElement.id,
                dslCode: newDslCode
            });
        }
    });
} else {
    console.error("Webview: DSL code textarea #dsl-code-textarea not found!");
    // You might want to send an error message to the extension here as well
}


// --- Helper function to get DSL code for an element using moddle ---
// This function is called when a BPMN element is selected.
function getDslCodeForElement(element) {
    if (!element || !element.businessObject) {
        return ''; // Return empty string if no element or business object
    }

    const businessObject = element.businessObject;
    const extensionElements = businessObject.extensionElements;

    if (extensionElements && extensionElements.values) {
        // Look for an extension element that stores your DSL code.
        // You need to define the type of this extension element in your moddle extension.
        // Assuming you have a custom extension element type like 'virtualFab:DslCode'
        // Replace 'virtualFab:DslCode' with the actual type defined in your moddle extension.
        const dslElement = extensionElements.values.find(val => val.$instanceOf('virtualFab:DslCode'));

        if (dslElement && dslElement.code) { // Assuming your DSL element has a 'code' property
            return dslElement.code;
        }
    }

    // Return an empty string if no DSL code is found
    return '';
}

// --- Helper function to update DSL code for an element using moddle ---
// This function is called when the DSL code in the textarea changes.
function updateDslCodeForElement(element, newDslCode) {
     if (!element || !element.businessObject || !bpmnModeler) {
         console.warn('Cannot update DSL code: No element selected or modeler not initialized.');
         return;
     }

     const businessObject = element.businessObject;
     const moddle = bpmnModeler.get('moddle');
     const modeling = bpmnModeler.get('modeling');

     let extensionElements = businessObject.extensionElements;

     // Find or create the extensionElements object
     if (!extensionElements) {
         extensionElements = moddle.create('bpmn:ExtensionElements');
         modeling.updateProperties(element, { extensionElements: extensionElements });
         // Update the businessObject reference after updating properties
         businessObject.extensionElements = extensionElements;
     }

     // Find or create your custom DSL extension element
     let dslElement = extensionElements.get('values').find(val => val.$instanceOf('virtualFab:DslCode')); // Replace 'virtualFab:DslCode'

     if (!dslElement) {
         // Create the DSL extension element if it doesn't exist
         dslElement = moddle.create('virtualFab:DslCode'); // Replace 'virtualFab:DslCode'
         // Add it to the extensionElements values
         extensionElements.get('values').push(dslElement);
         // Update the element in the modeler to reflect the added extension element
         modeling.updateProperties(element, { extensionElements: extensionElements });
         // Update the businessObject reference
         dslElement = extensionElements.get('values').find(val => val.$instanceOf('virtualFab:DslCode')); // Find the newly added element
     }

     // Update the 'code' property of your DSL extension element
     // Assuming your DSL element has a 'code' property
     if (dslElement && dslElement.code !== newDslCode) {
          dslElement.code = newDslCode;
          // Notify the modeler of the property change on the extension element
          // This is important for the command stack and saving.
          modeling.updateModdleProperties(element, dslElement, { code: newDslCode });
     }

     console.log('Updated DSL code in BPMN model for element:', element.id, newDslCode);

     // Note: The commandStack.changed listener will handle saving the XML after this update.
}


// --- Helper function to display diagnostics in the property panel ---
// This function is called when diagnostics are received from the extension.
function displayDiagnostics(diagnostics) {
    if (!diagnosticsDisplay) {
        console.error("Webview: Diagnostics display element #dsl-diagnostics not found!");
        return;
    }

    diagnosticsDisplay.innerHTML = ''; // Clear previous diagnostics

    if (!diagnostics || diagnostics.length === 0) {
        diagnosticsDisplay.textContent = 'No diagnostics.';
        diagnosticsDisplay.style.color = 'unset'; // Reset color
        return;
    }

    diagnostics.forEach(diag => {
        const diagElement = document.createElement('div');
        // LSP ranges are 0-based, display line numbers as 1-based
        diagElement.textContent = `Line ${diag.range.start.line + 1}: ${diag.message}`;
        diagElement.classList.add('diagnostic');
        // Map LSP severity (1-4) to CSS classes (1:Error, 2:Warning)
        switch (diag.severity) {
            case 1: // Error
                diagElement.classList.add('error');
                break;
            case 2: // Warning
                diagElement.classList.add('warning');
                break;
            // Add cases for Info and Hint if needed
        }
        diagnosticsDisplay.appendChild(diagElement);
    });
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
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}
