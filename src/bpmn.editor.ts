import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from './util'; // Assuming util.ts contains the getNonce function


// Define default BPMN content here or import from a constants file
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


export class BPMNEditorProvider implements vscode.CustomTextEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new BPMNEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(BPMNEditorProvider.viewType, provider);
    }

    public static readonly viewType = 'virtual-fab.bpmn';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        };

        webviewPanel.webview.html = this._getWebviewContent(webviewPanel.webview); // Pass only webview to get CSP source and nonce

        // Read out current document content and send to webview when ready
        const updateWebview = () => {
            // Only send if the webview is visible and ready (handled by the 'ready' message below)
            webviewPanel.webview.postMessage({
                command: 'loadXml',
                xml: document.getText() || defaultBpmnContent, // Use default content if document is empty
            });
        };

        // Hook up event handlers so that we can synchronize changes
        // to the text document with the webview
        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        // Receive message from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.command) {
                case 'saveXml':
                    this.updateTextDocument(document, e.xml);
                    return;
                case 'ready':
                    // Webview is ready, send initial content
                    updateWebview();
                    return;
                case 'error':
                    // Handle errors reported from the webview
                    if (e.message) {
                        vscode.window.showErrorMessage(`BPMN Editor Error: ${e.message}`);
                    }
                    return;
            }
        });

        // Make sure we get updated whenever the document is saved (redundant with onDidChangeTextDocument usually, but can catch external saves)
        const saveSubscription = vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });


        // When the webview is closed, dispose of the subscriptions
        webviewPanel.onDidDispose(() => {
            changeSubscription.dispose();
            saveSubscription.dispose();
        });

        // Initial load is triggered by the 'ready' message from the webview
    }

    private _getWebviewContent(webview: vscode.Webview) { // Removed resource URI as it's not needed for CSP/URIs
        const nonce = getNonce(); // Generate a nonce

        const bpmnJsUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist', 'bpmn-modeler.development.js')
        ));
        const bpmnCssUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist', 'assets', 'bpmn-js.css')
        ));
        const diagramCssUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'diagram.css')
        ));

        // Note: bpmn-js might require 'unsafe-eval' for certain functionalities.
        // 'unsafe-inline' for styles might be needed if bpmn-js injects styles inline,
        // otherwise using the nonce is preferred. Let's try using nonce for styles first.
        // The inline script block requires a nonce.
        return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Virtual Fab BPMN Editor</title>

			<meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                img-src ${webview.cspSource} data:;
                style-src ${webview.cspSource} 'nonce-${nonce}';
                script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval';
                font-src ${webview.cspSource};
            ">

			<link rel="stylesheet" type="text/css" href="${bpmnCssUri}">
			<link rel="stylesheet" type="text/css" href="${diagramCssUri}">
			<style nonce="${nonce}">
				html, body {
					height: 100%;
					margin: 0;
					padding: 0;
					overflow: hidden; /* Hide scrollbars */
				}
				#container {
					height: 100%;
					width: 100%;
					margin: 0;
					padding: 0; /* Remove padding here, let diagram.css handle it if needed */
					display: flex; /* Use flexbox for layout */
                    flex-direction: column; /* Stack children vertically */
					align-items: flex-start;
                    overflow: hidden; /* Prevent container scrollbars */
				}

                 /* Style for the palette container */
    .djs-palette {
        flex-shrink: 0; /* Prevent palette from shrinking */
        width: 48px; /* Standard palette width */
        height: 100%; /* Fill container height */
        background: #f8f8f8; /* Add a background color to make it visible */
        border-right: 1px solid #ccc; /* Add a separator */
        box-sizing: border-box; /* Include border in width */
        overflow-y: auto; /* Add vertical scroll if needed */
        position: relative; /* Ensure z-index works relative to this container */
        z-index: 10; /* Ensure it's above the canvas */
    }
        
                /* bpmn-js container needs to fill the parent */
                .bjs-container {
                    flex-grow: 1; /* Allow bpmn-js container to grow */
                    width: 100%;
                    height: 100%; /* Ensure it takes full height within flex container */
                }
                .canvas, .viewport {
                    width: 100% !important;
                    height: 100% !important;
                }
			</style>
		</head>
		<body>
			<div id="container"></div>

			<script src="${bpmnJsUri}"></script>

			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				let bpmnModeler;

				function loadDiagram(xml) {
					if (!bpmnModeler) {
						console.error('BpmnJS modeler not initialized.');
                        vscode.postMessage({ command: 'error', message: 'BPMN modeler failed to initialize.' });
						return;
					}

					bpmnModeler.importXML(xml)
						.then(() => {
							console.log('XML loaded successfully!');
                            // Ensure view is fit after loading
                            const canvas = bpmnModeler.get('canvas');
                            canvas.zoom('fit-viewport');
						})
						.catch(err => {
							console.error('Error loading XML', err);
							vscode.postMessage({ command: 'error', message: 'Failed to load BPMN diagram: ' + err.message });
						});
				}

                // Initialize modeler after window load
				window.addEventListener('load', () => {
                    if (window.BpmnJS) {
                        bpmnModeler = new window.BpmnJS({
                            container: '#container',
                            additionalModules: [
                                BpmnJS.PaletteModule,
                                //window.BpmnJS.ContextPadModule,
                                //window.BpmnJS.ModelingModule,
                                // Add ElementTemplatesModule if you use element templates
                                // window.BpmnJS.ElementTemplatesModule
                            ]
                        });

                        // Set up auto-save on change
                        bpmnModeler.on('changed', debounce(() => { // Use debounce to avoid saving too often
                            bpmnModeler.saveXML({ format: true }).then(({ xml }) => {
                                vscode.postMessage({ command: 'saveXml', xml: xml });
                            }).catch(err => {
                                console.error('Error saving XML', err);
                                vscode.postMessage({ command: 'error', message: 'Failed to save BPMN XML: ' + err.message });
                            });
                        }, 500)); // Save after 500ms of no changes

                        // Notify extension host that webview is ready
                        vscode.postMessage({ command: 'ready' });

                    } else {
                        console.error('BpmnJS object not found in the global scope after window load.');
                        vscode.postMessage({ command: 'error', message: 'BPMN library failed to load.' });
                    }
				});

                // Receive messages from the extension host
				window.addEventListener('message', event => {
					const message = event.data;
					switch (message.command) {
						case 'loadXml':
							loadDiagram(message.xml);
							break;
					}
				});

                // Simple debounce utility
                function debounce(func, wait) {
                    let timeout;
                    return function(...args) {
                        const context = this;
                        clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            func.apply(context, args);
                        }, wait);
                    };
                }

			</script>
		</body>
		</html>`;
    }

    private updateTextDocument(document: vscode.TextDocument, xml: string) {
        const edit = new vscode.WorkspaceEdit();

        // Replace the entire document content with the new XML
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            xml
        );

        return vscode.workspace.applyEdit(edit);
    }
}

// You will also need a util.ts file with a getNonce function like this:
/*
import * as crypto from 'crypto';

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
*/