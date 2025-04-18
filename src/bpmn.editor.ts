// src/bpmnEditorProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
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
 * that hosts the bpmn-js editor.
 */
export class BPMNEditorProvider implements vscode.CustomTextEditorProvider {

    /**
     * Registers the custom editor provider.
     * @param context The extension context.
     * @returns A disposable that tears down the provider.
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new BPMNEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(BPMNEditorProvider.viewType, provider, {
            // Enable save without confirmation prompt for custom editors
            webviewOptions: {
                retainContextWhenHidden: true, // Keep the webview state even when not visible
            },
            supportsMultipleEditorsPerDocument: false, // Depending on your needs
        });
    }

    // The view type identifier used in package.json contribution point
    public static readonly viewType = 'virtual-fab.bpmn';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    /**
     * Called when our custom editor is opened.
     *
     * This method is responsible for initializing the webview panel,
     * setting its HTML content, and setting up message listeners.
     */
    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup webview options
        webviewPanel.webview.options = {
            enableScripts: true, // Allow JavaScript execution
            localResourceRoots: [ // Restrict webview access to specific local directories
                vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'assets'), // Explicitly allow access to assets subdir
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
            ]
        };

        // Set the HTML content for the webview panel
        webviewPanel.webview.html = this._getWebviewContent(webviewPanel.webview, document);

        // --- Message Handling ---

        // Function to send the document content to the webview
        const updateWebview = () => {
            // Make sure the panel is still valid
            if (webviewPanel.visible) {
                console.log('Extension: Sending loadXml command to webview');
                webviewPanel.webview.postMessage({
                    command: 'loadXml',
                    xml: document.getText() || defaultBpmnContent, // Send current content or default
                });
            }
        };

        // Listen for messages from the webview
        webviewPanel.webview.onDidReceiveMessage(e => {
            console.log(`Extension: Received command: ${e.command}`);
            switch (e.command) {
                case 'saveXml':
                    // Received updated XML from the webview, update the backing TextDocument
                    this.updateTextDocument(document, e.xml);
                    return;
                case 'ready':
                    // Webview is ready to receive the initial document content
                    console.log('Extension: Webview reported ready');
                    updateWebview();
                    return;
                case 'error':
                    // Display errors reported by the webview
                    if (e.message) {
                        vscode.window.showErrorMessage(`BPMN Editor Error: ${e.message}`);
                    }
                    return;
            }
        }, null, this.context.subscriptions); // Dispose listener with extension context

        // --- Document Change Handling ---

        // Re-send the document content to the webview when the document changes
        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            // Check if the change is for the document associated with this editor
            if (e.document.uri.toString() === document.uri.toString()) {
                console.log('Extension: Document changed, updating webview');
                updateWebview();
            }
        });

        // Optional: Update webview if the document is saved (might be redundant with onDidChangeTextDocument)
        // const saveSubscription = vscode.workspace.onDidSaveTextDocument(doc => {
        //     if (doc.uri.toString() === document.uri.toString()) {
        //         console.log('Extension: Document saved, updating webview');
        //         updateWebview();
        //     }
        // });

        // Ensure resources are cleaned up when the panel is closed
        webviewPanel.onDidDispose(() => {
            console.log('Extension: Webview panel disposed');
            changeSubscription.dispose();
            // saveSubscription.dispose();
        });

        // If the webview panel becomes visible again, update it
        webviewPanel.onDidChangeViewState(e => {
            if (e.webviewPanel.visible) {
                console.log('Extension: Webview became visible, updating');
                updateWebview();
            }
        });

        // Initial load when the editor is first opened (if it's already visible)
        // The 'ready' message handles the initial load more reliably
        // if (webviewPanel.visible) {
        //     updateWebview();
        // }
    }

    /**
     * Generates the HTML content for the webview.
     * @param webview The webview instance.
     * @param document The document being edited.
     * @returns The HTML string.
     */
    private _getWebviewContent(webview: vscode.Webview, document: vscode.TextDocument): string {
        const nonce = getNonce(); // Generate a unique nonce for CSP

        // Get URIs for required resources, converting file paths to webview-accessible URIs
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
        // Custom diagram styling (optional)
        const customDiagramCssUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this.context.extensionUri, 'media', 'diagram.css'
        ));

        // Construct the HTML
        // **Removed comments inside the content attribute of the CSP meta tag**
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

        <style>
            html, body {
                height: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: var(--vscode-editor-background); /* Use VS Code theme background */
                color: var(--vscode-editor-foreground); /* Use VS Code theme foreground */
            }
            #container {
                height: 100%;
                width: 100%;
            }
            /* Ensure bpmn-js elements inherit colors or use VS Code theme variables */
            .djs-container, .djs-palette, .djs-popup {
                 /* Example: Adapt background/foreground if needed */
                /* background-color: var(--vscode-sideBar-background); */
                /* color: var(--vscode-sideBar-foreground); */
            }
            /* Add more specific theme overrides if necessary */
        </style>
    </head>
    <body>
        <div id="container"></div>

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
        // Avoid unnecessary edits if content hasn't changed
        if (document.getText() === xml) {
            return;
        }

        // Create a workspace edit to replace the entire document content
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0), // Range covering the whole document
            xml
        );

        // Apply the edit
        return vscode.workspace.applyEdit(edit);
    }
}
