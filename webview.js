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

// Import Camunda properties provider
// TODO: Replace 'bpmn-js-properties-panel/dist/path/to/camunda/provider' with the actual path
// based on the structure of your installed bpmn-js-properties-panel package.
// Look inside node_modules/bpmn-js-properties-panel/dist for a 'provider' or 'camunda' folder.
// Ensure this path is correct in your node_modules
// import CamundaPropertiesProviderModule from 'bpmn-js-properties-panel/dist/provider/camunda'; // Commented out


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
    console.log("loadDiagram: Called with XML:", xml ? xml.substring(0, 200) + '...' : 'empty'); // Log start of function and part of XML

    // Check if the modeler instance exists
    if (!bpmnModeler) {
        console.error("loadDiagram: BpmnJS modeler not initialized.");
        vscode.postMessage({
            command: "error",
            message: "BPMN modeler failed to initialize.",
        });
        return;
    }

    try {
        console.log("loadDiagram: Attempting to import XML...");
        // Import the XML into the modeler
        const result = await bpmnModeler.importXML(xml);
        console.log("loadDiagram: XML import result:", result); // Log the result object

        // Access the canvas module and fit the diagram to the viewport
        const canvas = bpmnModeler.get("canvas");
        canvas.zoom("fit-viewport");
        console.log("loadDiagram: Diagram zoomed to fit viewport.");


        // After loading, select the start event or first element to show properties
        const elementRegistry = bpmnModeler.get('elementRegistry');
        const startEvent = elementRegistry.find(el => el.type === 'bpmn:StartEvent');
        if (startEvent) {
            const selection = bpmnModeler.get('selection');
            selection.select(startEvent);
            console.log("loadDiagram: Selected StartEvent:", startEvent.id);
        } else {
             console.log("loadDiagram: No StartEvent found to select.");
             // If no start event, try selecting the first element found
             const firstElement = elementRegistry.getAll().find(el => el.type !== 'bpmn:Process' && el.type !== 'bpmn:Collaboration');
             if(firstElement) {
                 const selection = bpmnModeler.get('selection');
                 selection.select(firstElement);
                 console.log("loadDiagram: No StartEvent found, selected first element:", firstElement.id, firstElement.type);
             } else {
                 console.log("loadDiagram: No elements found in the diagram to select.");
             }
        }

    } catch (err) {
        // Log and report errors during XML import
        console.error("loadDiagram: Error loading XML", err); // Log the full error object
        vscode.postMessage({
            command: "error",
            message: "Failed to load BPMN diagram: " + err.message,
        });
    }
}

// --- Initialization ---

// Wait for the DOM to be fully loaded before getting elements and instantiating BpmnJS
document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOMContentLoaded: DOM is fully loaded.");

    // Get the container elements from the HTML *after* the DOM is ready
    const diagramContainer = document.getElementById("canvas");
    const propertiesPanelContainer = document.getElementById(
        "properties-panel-container"
    ); // Container for standard properties
    const dslPropertiesPanelContainer = document.getElementById(
        "properties-panel-container-dsl"
    ); // Container for your custom DSL properties

    console.log("DOMContentLoaded: Diagram container found:", !!diagramContainer); // Check if element was found
    console.log("DOMContentLoaded: Standard properties panel container found:", !!propertiesPanelContainer);
    console.log("DOMContentLoaded: DSL properties panel container found:", !!dslPropertiesPanelContainer);


    if (!diagramContainer) {
        console.error("Webview: Diagram container #canvas not found!");
        vscode.postMessage({
            command: "error",
            message:
                "Failed to initialize BPMN editor: Diagram container #canvas not found.",
        });
        return; // Stop execution if essential element is missing
    }

    console.log("DOMContentLoaded: Attempting to create BpmnJS Modeler instance...");

    // Define the modules to be used
    const additionalModules = [
        PaletteModule,
        ModelingModule,
        ContextPadModule,
        BpmnPropertiesPanelModule, // Standard properties panel module
        BpmnPropertiesProviderModule, // Standard BPMN properties provider
        // CamundaPropertiesProviderModule, // Camunda specific properties provider - Commented out
        BpmnColorPickerModule,
        CreateAppendAnythingModule,
        CreateAppendElementTemplatesModule,
        ElementTemplatesCoreModule,
        TokenSimulationModule,
        // Add any other necessary modules here
    ];

    // Define the virtualFab moddle extensions (kept here for later testing)
    const virtualFabModdleDescriptor = {
        uri: 'http://virtual-fab.com/schema/bpmn/extension',
        prefix: 'virtualFab',
        xml: {
          tagAlias: 'lowerCase',
        },
        types: [
          {
            name: 'CpnMappingDsl',
            superClass: ['Element'],
            meta: {
              allowedIn: [
                'bpmn:Task',
                'bpmn:ServiceTask',
                'bpmn:UserTask',
                'bpmn:BusinessRuleTask',
                'bpmn:ScriptTask',
                'bpmn:ReceiveTask',
                'bpmn:ManualTask',
                'bpmn:ExclusiveGateway',
                'bpmn:SequenceFlow',
                'bpmn:ParallelGateway',
                'bpmn:InclusiveGateway',
                'bpmn:EventBasedGateway',
                'bpmn:StartEvent',
                'bpmn:IntermediateCatchEvent',
                'bpmn:IntermediateThrowEvent',
                'bpmn:EndEvent',
                'bpmn:BoundaryEvent',
                'bpmn:CallActivity',
                'bpmn:SubProcess',
                'bpmn:Process'
              ]
            },
            properties: [
              {
                name: 'dslCode',
                isBody: true,
                type: 'String'
              }
            ]
          },
           { // Add another type if you use 'virtualFab:DslCode' as in the helper functions
               name: 'DslCode', // The name of the property storing the DSL code
               extends: [ 'bpmn:ExtensionElements' ], // It extends bpmn:ExtensionElement
               properties: [
                   {
                       name: 'code', // The name of the property storing the DSL code
                       isBody: true, // Use isBody: true if the DSL code is the text content of the element
                       type: 'String' // The type of the property
                   }
               ]
           }
            // Define other custom types here if needed (e.g., for arcs, guards, actions)
        ]
    };


    // Define the moddle extensions to be passed to BpmnJS
    // Now include both Camunda and virtualFab
    const moddleExtensions = {
      camunda: camundaModdleDescriptor, // Include Camunda if you use Camunda-specific elements/properties
      virtualFab: virtualFabModdleDescriptor // Include virtualFab
    };

    try {
        // Create a new BpmnJS Modeler instance now that containers are confirmed to exist
        bpmnModeler = new BpmnJS({
            container: diagramContainer, // Pass the actual DOM element reference
            propertiesPanel: {
                parent: propertiesPanelContainer, // Pass the actual DOM element reference for standard properties
            },
            // Include necessary modules
            additionalModules: additionalModules, // Pass the defined array
            // Configure moddle extensions
            moddleExtensions: moddleExtensions, // Pass the defined object (now includes Camunda and virtualFab)
            // Configuration options
            keyboard: {
                bindTo: document,
            },
            // You might need to configure the properties provider with element templates here
            // elementTemplates: {
            //     provider: new YourElementTemplatesProviderProvider() // If you have a custom provider
            // }
        });
        console.log("DOMContentLoaded: BpmnJS Modeler instance created successfully.");

    } catch (error) {
        console.error("DOMContentLoaded: Error creating BpmnJS Modeler instance:", error);
         vscode.postMessage({
             command: "error",
             message: "Failed to create BpmnJS Modeler instance: " + error.message,
         });
         return; // Stop if modeler creation failed
    }


    // --- Instantiate and Connect Properties Panel ---
    // The BpmnJS constructor with propertiesPanel config already handles instantiation
    // and basic connection. We just need to ensure the container exists.
    if (propertiesPanelContainer) {
        // The properties panel instance is usually accessible via the modeler's modules
        // or implicitly managed by the propertiesPanel configuration.
        // For direct access if needed later, you might get it like this:
        // propertiesPanel = bpmnModeler.get('propertiesPanel');
        console.log("DOMContentLoaded: Standard properties panel container found and configured.");
    } else {
        console.warn("DOMContentLoaded: Standard properties panel container #properties-panel-container not found. Properties panel will not be displayed.");
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
        }, 300) // Keep a reasonable debounce delay
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
            console.log('Webview: Associated DSL code for selected element:', associatedDslCode, element.id);
            // Send message to extension that an element was selected (includes DSL code)
            vscode.postMessage({
                type: 'bpmnElementSelected',
                elementId: elementId,
                dslCode: associatedDslCode
            });
            updateDslPanel(elementId,associatedDslCode);
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
// Function to update the custom DSL property panel UI
function updateDslPanel(elementId, dslCode) {
    // Try to get the element name for a more descriptive title
    const currentElementBo = currentElement ? currentElement.businessObject : null;
    const elementName = currentElementBo?.name; // Get name if available
    const displayId = elementId || '';
    const displayName = elementName ? ` (${elementName})` : ''; // Add name in parentheses if it exists

    // Update the display showing which element is selected
    if (elementIdDisplay) {
         elementIdDisplay.textContent = displayId ? `DSL for: ${displayId}${displayName}` : 'No element selected';
    }

    // Update the textarea value
    if (dslCodeTextarea) {
        const incomingValue = dslCode || ''; // Ensure it's a string
        const currentValue = dslCodeTextarea.value;

        // Always set the value when this function is called (on element selection)
        // The previous focus check was causing it to not update if the textarea had focus.
        // We only need to set it if the value is actually different.
        if (currentValue !== incomingValue) {
             console.log(`updateDslPanel: Updating textarea for ${elementId}. Current: "${currentValue.substring(0,20)}...", Incoming: "${incomingValue.substring(0,20)}..."`);
             dslCodeTextarea.value = incomingValue;
        } else {
            // console.log(`updateDslPanel: Skipping textarea update for ${elementId} because value is the same.`);
        }
    }

    // Diagnostics are updated separately by the 'updateDslDiagnostics' message handler
    // displayDiagnostics([]); // Don't clear diagnostics here, let the specific message handle it.
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
    console.log('getDslCodeForElement: Called for element:', element ? element.id : 'null', 'element type:', element ? element.type : 'null');
    if (!element || !element.businessObject) {
        console.log('getDslCodeForElement: No element or business object.');
        return ''; // Return empty string if no element or business object
    }

    const businessObject = element.businessObject;
    console.log('getDslCodeForElement: businessObject:', businessObject);
    const extensionElements = businessObject.extensionElements;

    console.log('getDslCodeForElement: extensionElements:', extensionElements);


    if (extensionElements && extensionElements.values) {
        console.log('getDslCodeForElement: Found extensionElements with values. Values:', extensionElements.values);
        // Look for an extension element that stores your DSL code.
        // Check for both 'CpnMappingDsl' and 'DslCode' types for flexibility
        const dslElement = extensionElements.values.find(val => {
             // Log the type of each extension element found
             console.log('getDslCodeForElement: Checking extension element type:', val.$type);
             // Check if $instanceOf is a function before calling it
             if (typeof val.$instanceOf === 'function') {
                 const isCpnMappingDsl = val.$instanceOf('virtualFab:CpnMappingDsl');
                 const isDslCode = val.$instanceOf('virtualFab:DslCode');
                 console.log(`getDslCodeForElement: Instance check - isCpnMappingDsl: ${isCpnMappingDsl}, isDslCode: ${isDslCode}`);
                 return isCpnMappingDsl || isDslCode;
             }
             console.log('getDslCodeForElement: Extension element does not have $instanceOf function.');
             return false; // Not a moddle element with $instanceOf
        });

        console.log('getDslCodeForElement: Found dslElement:', dslElement);

        // Check for the 'dslCode' property first (from CpnMappingDsl) then 'code' (from DslCode)
        if (dslElement) {
            // Log the properties of the found dslElement
            console.log('getDslCodeForElement: Properties of found dslElement:', Object.keys(dslElement));
            console.log('getDslCodeForElement: Value of dslElement.dslCode:', dslElement.dslCode);
            


            if (typeof dslElement.dslCode === 'string') {
                 console.log('getDslCodeForElement: Returning dslCode property.');
                return dslElement.dslCode;
            } else if (typeof dslElement.code === 'string') {
                 console.log('getDslCodeForElement: Returning code property.');
                return dslElement.code;
            } else {
                 console.log('getDslCodeForElement: Found dslElement, but neither dslCode nor code property is a string.');
            }
        } else {
             console.log('getDslCodeForElement: No dslElement (virtualFab:CpnMappingDsl or virtualFab:DslCode) found in extensionElements.');
        }
    } else {
        console.log('getDslCodeForElement: No extensionElements or values found on business object.');
    }

    // Return an empty string if no DSL code is found
    return '';
}

// --- Helper function to update DSL code for an element using moddle ---
// This function is called when the DSL code in the textarea changes.
function updateDslCodeForElement(element, newDslCode) {
     console.log('updateDslCodeForElement: Called for element:', element.id, 'with new DSL code:', newDslCode);
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
         console.log('updateDslCodeForElement: Creating new extensionElements.');
         extensionElements = moddle.create('bpmn:ExtensionElements');
         // Need to update the element's business object to include the new extensionElements
         // Use modeling.updateProperties to ensure this change is part of the command stack
         modeling.updateProperties(element, { extensionElements: extensionElements });
         // Update the businessObject reference after updating properties
         businessObject.extensionElements = extensionElements;
     } else {
         console.log('updateDslCodeForElement: Found existing extensionElements.');
     }

     // Find or create your custom DSL extension element
     // Check for both possible type names ('CpnMappingDsl' or 'DslCode')
     let dslElement = extensionElements.get('values').find(val =>
         val.$instanceOf('virtualFab:CpnMappingDsl') || val.$instanceOf('virtualFab:DslCode')
     );

     if (!dslElement) {
         console.log('updateDslCodeForElement: Custom DSL element not found, creating new virtualFab:CpnMappingDsl.');
         // Create the DSL extension element if it doesn't exist
         // Use 'virtualFab:CpnMappingDsl' as the primary type based on your grammar name
         dslElement = moddle.create('virtualFab:CpnMappingDsl');
         // Add it to the extensionElements values
         extensionElements.get('values').push(dslElement);
         // Update the element in the modeler to reflect the added extension element
         modeling.updateProperties(element, { extensionElements: extensionElements });
         // Update the businessObject reference and re-find the element to ensure correct reference
         dslElement = element.businessObject.extensionElements.get('values').find(val =>
             val.$instanceOf('virtualFab:CpnMappingDsl') || val.$instanceOf('virtualFab:DslCode')
         );
     } else {
         console.log('updateDslCodeForElement: Found existing custom DSL element.');
     }

     // Determine the correct property name ('dslCode' or 'code') based on the found or created element type
     const dslCodePropertyName = dslElement && dslElement.$instanceOf('virtualFab:CpnMappingDsl') ? 'dslCode' : 'code';


     // Update the 'dslCode' or 'code' property of your DSL extension element
     if (dslElement && dslElement[dslCodePropertyName] !== newDslCode) {
          console.log(`updateDslCodeForElement: Updating ${dslCodePropertyName} property.`);
          // Use modeling.updateModdleProperties to update properties of moddle elements
          // This is important for the command stack and saving.
          modeling.updateModdleProperties(element, dslElement, { [dslCodePropertyName]: newDslCode });
          console.log('updateDslCodeForElement: Updated DSL code in BPMN model for element:', element.id, newDslCode);
     } else {
         console.log('updateDslCodeForElement: DSL code is the same, no update needed in model.');
     }

     // Note: The commandStack.changed listener will handle saving the XML after this update.
}


// --- Helper function to display diagnostics in the property panel ---
// This function is called when diagnostics are received from the extension.
function displayDiagnostics(diagnostics) {
    const diagnosticsDisplay = document.getElementById('dsl-diagnostics'); // Get reference here
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
        // Add a check to ensure diag.range and its properties exist
        if (!diag.range || typeof diag.range.start?.line !== 'number' || typeof diag.range.start?.character !== 'number') {
            console.error("Webview: Received malformed diagnostic:", diag);
            // Optionally display a generic error message for the malformed diagnostic
            const diagElement = document.createElement('div');
            diagElement.textContent = `Malformed diagnostic received: ${diag.message || 'Unknown error'}`;
            diagElement.classList.add('diagnostic', 'error'); // Style as error
            diagnosticsDisplay.appendChild(diagElement);
            return; // Skip this diagnostic
        }

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
