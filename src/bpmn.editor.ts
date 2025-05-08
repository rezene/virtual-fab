// src/bpmn.editor.ts
import * as vscode from 'vscode';
import { LanguageClient, PublishDiagnosticsNotification, DidOpenTextDocumentNotification, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, TextDocumentItem } from 'vscode-languageclient/node'; // Import necessary LSP types, including TextDocumentItem

import { getNonce } from './util'; // Assuming you have a utility function for nonce

// Default empty BPMN diagram
const defaultBpmnContent = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/2.0/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/2.0/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="81" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Provider for BPMN file editors.
 *
 * This class is responsible for creating and managing the webview
 * that hosts the bpmn-js editor and integrating with the LSP client
 * for DSL code in the property panel.
 */
export class BPMNEditorProvider implements vscode.CustomTextEditorProvider {

    public static readonly viewType = 'virtual-fab.bpmn';
    private readonly virtualDocuments = new Map<string, { uri: string, content: string, version: number }>();
    private readonly documentWebviews = new Map<string, vscode.WebviewPanel>();


    /**
     * Registers the custom editor provider.
     * @param context The extension context.
     * @param lspClient The LanguageClient instance.
     * @returns A disposable that tears down the provider.
     */
    public static register(context: vscode.ExtensionContext, lspClient: LanguageClient): vscode.Disposable {
        const provider = new BPMNEditorProvider(context, lspClient);
        return vscode.window.registerCustomEditorProvider(BPMNEditorProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        });
    }

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly lspClient: LanguageClient // Accept the LSP client instance
    ) {
         // Listen for diagnostics from the LSP server
         this.lspClient.onNotification(PublishDiagnosticsNotification.type, params => {
             console.log('Extension: Received diagnostics from LSP server:', params);

             const bpmnDocumentUriString = this.getBpmnUriFromVirtualUri(params.uri);
             if (!bpmnDocumentUriString) {
                 console.warn(`Extension: Could not map virtual URI ${params.uri} back to BPMN document URI.`);
                 return;
             }

             const webviewPanel = this.documentWebviews.get(bpmnDocumentUriString);
             if (webviewPanel) {
                 webviewPanel.webview.postMessage({
                     command: 'updateDslDiagnostics',
                     uri: params.uri, 
                     diagnostics: params.diagnostics.map(d => ({ 
                         range: { start: d.range.start, end: d.range.end },
                         message: d.message,
                         severity: d.severity, 
                     }))
                 });
             } else {
                 console.warn(`Extension: Could not find webview panel for BPMN document URI ${bpmnDocumentUriString}.`);
             }
         });
    }


    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Store the webview panel associated with this BPMN document
        this.documentWebviews.set(document.uri.toString(), webviewPanel);

        // Setup webview options
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'assets'),
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
            ]
        };

        
        webviewPanel.webview.html = this._getWebviewContent(webviewPanel.webview, document);

        // --- Message Handling ---

        const updateWebview = () => {
            if (webviewPanel.visible) {
                console.log('Extension: Sending loadXml command to webview');
                webviewPanel.webview.postMessage({
                    command: 'loadXml',
                    xml: document.getText() || defaultBpmnContent,
                });
            }
        };

        webviewPanel.webview.onDidReceiveMessage(async e => {
            console.log(`Extension: Received command: ${e.command}`);
            switch (e.command) {
                case 'saveXml':
                    this.updateTextDocument(document, e.xml);
                    return;
                case 'ready':
                    console.log('Extension: Webview reported ready');
                    updateWebview();
                    return;
                case 'error':
                    if (e.message) {
                        vscode.window.showErrorMessage(`BPMN Editor Error: ${e.message}`);
                    }
                    return;
                case 'bpmnElementSelected':
                     console.log('Extension: BPMN element selected:', e.elementId);
                     console.log('Extension: Associated DSL code:', e.dslCode);

                     // Handle element selection: Create/update virtual document and notify LSP
                     // This will also send the updatePropertyPanel message to the webview
                     this.handleElementSelected(document.uri, e.elementId, e.dslCode, webviewPanel);
                     return;
                case 'dslCodeChanged':
                    console.log('Extension: DSL code changed for element:', e.elementId);
                    console.log('Extension: New DSL code:', e.dslCode);
                    this.handleDslCodeChanged(document.uri, e.elementId, e.dslCode);
                    return;
            }
        }, null, this.context.subscriptions);

        // --- Document Change Handling ---

        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                console.log('Extension: Document changed, updating webview');
                updateWebview();
            }
        });

        // Ensure resources are cleaned up when the panel is closed
        webviewPanel.onDidDispose(() => {
            console.log('Extension: Webview panel disposed for document:', document.uri.toString());
            changeSubscription.dispose();
            this.documentWebviews.delete(document.uri.toString()); 

            // Clean up virtual documents associated with this BPMN document
            this.virtualDocuments.forEach((doc, uri) => {
                if (this.getBpmnUriFromVirtualUri(uri) === document.uri.toString()) {
                    this.virtualDocuments.delete(uri);
                     this.lspClient.sendNotification(DidCloseTextDocumentNotification.type, {
                         textDocument: { uri: uri.toString() }
                     });
                }
            });
        });

        webviewPanel.onDidChangeViewState(e => {
            if (e.webviewPanel.visible) {
                console.log('Extension: Webview became visible, updating');
                updateWebview();
            }
        });
    }

    private async handleElementSelected(bpmnDocumentUri: vscode.Uri, elementId: string, dslCode: string, webviewPanel: vscode.WebviewPanel) {
        const virtualUri = this.getVirtualUri(bpmnDocumentUri, elementId).toString();
        const virtualDocEntry = this.virtualDocuments.get(virtualUri);
        webviewPanel.webview.postMessage({
             command: 'updatePropertyPanel',
             elementId: elementId,
             dslCode: dslCode
        });


        if (!virtualDocEntry) {
            console.log(`Extension: Creating new virtual document entry for ${virtualUri}`);
            const newDocEntry = {
                uri: virtualUri,
                content: dslCode,
                version: 1 // Start with version 1
            };
            this.virtualDocuments.set(virtualUri, newDocEntry);

            this.lspClient.sendNotification(DidOpenTextDocumentNotification.type, {
                textDocument: {
                    uri: newDocEntry.uri,
                    languageId: 'virtual-fab-dsl-language-id', 
                    version: newDocEntry.version,
                    text: newDocEntry.content,
                } as TextDocumentItem // Cast to TextDocumentItem
            });

        } else {
             console.log(`Extension: Virtual document entry already exists for ${virtualUri}, updating content and version.`);
            
            virtualDocEntry.content = dslCode;
            virtualDocEntry.version++; // Increment version

             
             this.lspClient.sendNotification(DidChangeTextDocumentNotification.type, {
                 textDocument: {
                     uri: virtualDocEntry.uri,
                     version: virtualDocEntry.version, // Use the updated version
                 },
                 contentChanges: [{ text: dslCode }] // Send the full new text
             });
        }

       
    }

 
     private async handleDslCodeChanged(bpmnDocumentUri: vscode.Uri, elementId: string, newDslCode: string) {
         const virtualUri = this.getVirtualUri(bpmnDocumentUri, elementId).toString();
         let virtualDocEntry = this.virtualDocuments.get(virtualUri);

         if (!virtualDocEntry) {

             console.warn(`Extension: Received dslCodeChanged for unknown virtual document entry: ${virtualUri}. Creating it.`);
            
             const webviewPanel = this.documentWebviews.get(bpmnDocumentUri.toString());
             if (webviewPanel) {
                 
                 await this.handleElementSelected(bpmnDocumentUri, elementId, newDslCode, webviewPanel);
             } else {
                 console.error(`Extension: Could not find webview panel for BPMN document URI ${bpmnDocumentUri.toString()} to create virtual document entry.`);
             }
             return; // Exit this function
         } else {
             console.log(`Extension: Virtual document entry found for ${virtualUri}. Updating content and version.`);
         }

         
         virtualDocEntry.content = newDslCode;
         virtualDocEntry.version++; // Increment version

         // Notify LSP server of the change
         this.lspClient.sendNotification(DidChangeTextDocumentNotification.type, {
             textDocument: {
                 uri: virtualDocEntry.uri,
                 version: virtualDocEntry.version, // Use the updated version
             },
             contentChanges: [{ text: newDslCode }] // Send the full new text
         });

         console.log(`Extension: Sent DidChangeTextDocumentNotification for ${virtualUri}.`);

        
     }


    private getVirtualUri(bpmnDocumentUri: vscode.Uri, elementId: string): vscode.Uri {
        const encodedPath = encodeURIComponent(bpmnDocumentUri.path);
        const uriString = `dsl-property-panel://${bpmnDocumentUri.authority || 'virtual-fab'}${encodedPath}#${elementId}`;
        return vscode.Uri.parse(uriString);
    }

   
     private getBpmnUriFromVirtualUri(virtualUriString: string): string | undefined {
         try {
             const uri = vscode.Uri.parse(virtualUriString);
             if (uri.scheme === 'dsl-property-panel') {
                 const encodedBpmnPath = uri.path;
                 const bpmnPath = decodeURIComponent(encodedBpmnPath);
                 const authority = uri.authority ? `//${uri.authority}` : '';
                 return `file://${authority}${bpmnPath}`; // Assuming original is a file URI
             }
         } catch (e) {
             console.error('Error parsing virtual URI:', e);
         }
         return undefined;
     }

    private _getWebviewContent(webview: vscode.Webview, document: vscode.TextDocument): string {
        const nonce = getNonce(); // Generate a unique nonce for CSP

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'dist', 'webview.js'
        ));


        // --- CSS URIs ---
        // Base diagram-js CSS
        const diagramJsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'dist', 'assets', 'diagram-js.css'
        ));
        // bpmn-js specific CSS
        const bpmnJsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'dist', 'assets', 'bpmn-js.css'
        ));
        // bpmn-font CSS (ensure this path matches where esbuild-plugin-copy puts it)
        const bpmnFontCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'dist', 'assets', 'bpmn-font', 'css', 'bpmn.css'
        ));

      // Get URIs for properties panel CSS
    const propertiesPanelCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
        this.context.extensionUri, 'dist', 'assets', 'properties-panel.css' // Adjust path if necessary
    ));

    const bpmnColorCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
        this.context.extensionUri, 'dist','assets', 'color-picker.css'
    ));
    const bpmnTokenSimulationCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
        this.context.extensionUri, 'dist','assets', 'bpmn-js-token-simulation.css'
    ));


        // Custom diagram styling (optional)
        const customDiagramCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'diagram.css'
        ));

        // Construct the HTML
        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BPMN Editor</title>

        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            img-src ${webview.cspSource} data:;
            style-src ${webview.cspSource} 'unsafe-inline';
            script-src 'nonce-${nonce}';
            font-src ${webview.cspSource};
            connect-src ${webview.cspSource};
        ">

        <link rel="stylesheet" type="text/css" href="${diagramJsCssUri}">
        <link rel="stylesheet" type="text/css" href="${bpmnJsCssUri}">
        <link rel="stylesheet" type="text/css" href="${bpmnFontCssUri}">
        <link rel="stylesheet" type="text/css" href="${customDiagramCssUri}">
        <link rel="stylesheet" type="text/css" href="${bpmnColorCssUri}">
         <link rel="stylesheet" type="text/css" href="${bpmnTokenSimulationCssUri}">

         <link rel="stylesheet" type="text/css" href="${propertiesPanelCssUri}">


        <style>
            html, body {
                height: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: #fff;
                color: var(--vscode-editor-foreground);
            }
            /* Flex container for diagram and property panels */
            #editor-container {
                display: flex;
                flex-direction: row; /* Canvas on left, sidebar on right */
                height: 100%;
                width: 100%;
            }
            /* Diagram container takes remaining space */
            #canvas {
                flex-grow: 1; /* Allows canvas to take up available horizontal space */
                height: 100%;
                width: 0; /* Important for flex-grow to work correctly in a row */
            }
            /* Container for the two property panels (the right sidebar) */
            #right-sidebar {
                 display: flex;
                 flex-direction: column; /* Stack the two panels vertically */
                 width: 280px; /* Set the width of the sidebar */
                 height: 100%; /* Take full height of editor-container */
                 overflow-y: auto; /* Add scrollbar if panels overflow vertically */
                 border-left: 1px solid var(--vscode-panel-border); /* Separator from canvas */
                 background-color: #fff; /* Background color for the sidebar */
                 color: var(--vscode-sideBar-foreground); /* Consistent text color */
            }

            /* Individual property panel containers within the sidebar */
            #properties-panel-container,
            #properties-panel-container-dsl {
                width: 100%; /* Take full width of the sidebar */
                height: auto; /* Content determines height */
                box-sizing: border-box; /* Include padding in width */

            }

            /* Remove bottom border from the last panel */
            #properties-panel-container-dsl:last-child {
                border-bottom: none;
            }


             /* Style for property panel content */
             /* These styles apply to content *within* the individual panels */
             .property-panel-content h3, .property-panel-content h4 {
                 color: var(--vscode-sideBar-foreground); /* Use sidebar foreground for headers */
                 border-bottom: 1px solid var(--vscode-panel-border);
                 padding-bottom: 5px;
                 margin-top: 10px;
                 margin-bottom: 10px;
             }

             .property-section {
                 background-color: #fff;
                 color: black; /* Use black text for better contrast */
                 margin-bottom: 10px;
                 padding: 10px;
                 border-radius: 5px;
             }

             .property-section h4 {
                  border-bottom: none; /* Remove border from h4 inside section */
                  margin-top: 0;
                  padding-bottom: 0;
                  color:black;
             }

             .dsl-editor-container {
                 /* No specific background here, handled by property-section */
                 margin-top: 10px; /* Space above the DSL section */
             }

             #dsl-code-textarea {
                 width: 100%;
                 box-sizing: border-box;
                 font-family: var(--vscode-editor-font-family);
                 font-size: var(--vscode-editor-font-size);
                 background-color: #fff;;
                 color: black;
                 border: 1px solid #ccc;
                 padding: 5px;
                 resize: vertical;
             }

             #dsl-code-textarea:focus {
                 outline: 1px solid var(--vscode-focusBorder);
                 border-color: var(--vscode-focusBorder);
             }

             .diagnostics {
                 margin-top: 5px;
                 font-size: 0.9em;
                 color: var(--vscode-editorError-foreground);
             }

             .diagnostics div {
                 margin-bottom: 3px;
                 padding: 2px 5px;
                 border-radius: 3px;
             }

             .diagnostics .error {
                 background-color: var(--vscode-editorError-background);
                 border-left: 3px solid var(--vscode-editorError-border);
             }

             .diagnostics .warning {
                 color: var(--vscode-editorWarning-foreground);
                 background-color: var(--vscode-editorWarning-background);
                 border-left: 3px solid var(--vscode-editorWarning-border);
             }


        </style>
    </head>
    <body>
        <div id="editor-container">
            <div id="canvas"></div>
            <div id="right-sidebar">
                <div id="properties-panel-container">

                </div>
                <div id="properties-panel-container-dsl">
                     <div class="property-panel-content">

                         <div id="element-id-display"></div>

                         <div class="property-section dsl-editor-container">
                             <h4>DSL Code</h4>
                             <textarea id="dsl-code-textarea" rows="8" cols="50" placeholder="Enter DSL code here..."></textarea>
                             <div id="dsl-diagnostics" class="diagnostics"></div>
                         </div>

                     </div>
                </div>
            </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
    }


    /**
     * Updates the content of the TextDocument associated with the editor.
     * @param document The TextDocument to update.
     * @param xml The new XML content.
     */
    private updateTextDocument(document: vscode.TextDocument, xml: string) {
        if (document.getText() === xml) {
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            xml
        );

        return vscode.workspace.applyEdit(edit);
    }
}
