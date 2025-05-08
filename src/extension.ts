// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { BPMNEditorProvider } from './bpmn.editor';
import { LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo, TransportKind } from 'vscode-languageclient/node'; // Import LSP client modules
import * as net from 'net'; // Import the net module for sockets

// Default empty BPMN diagram content
const defaultBpmnContent = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1u5ywmd" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-js (https://demo.bpmn.io)" exporterVersion="18.3.1">
  <bpmn:process id="Process_0frwro1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1vbmryp" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0frwro1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1vbmryp">
        <dc:Bounds x="152" y="122" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

let client: LanguageClient; // Declare a variable to hold the LSP client instance

export function activate(context: vscode.ExtensionContext) {
    console.log('"virtual-fab" extension is now active!');
    const serverOptions: ServerOptions = () => {
        
        const socket = net.connect({ port: 6009 });
        const streamInfo: StreamInfo = {
            reader: socket,
            writer: socket
        };

        // Basic error handling for the socket connection
        socket.on('error', (err) => {
            console.error('LSP socket connection error:', err);
            vscode.window.showErrorMessage(`Failed to connect to DSL Language Server: ${err.message}. Is the server running on port 6009?`);
        });

        return Promise.resolve(streamInfo);
    };

    const clientOptions: LanguageClientOptions = {
        // The document selector tells the LSP client which documents to associate with this server.
        documentSelector: [{ scheme: 'dsl-property-panel', language: 'virtual-fab-dsl-language-id' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*') // Adjust pattern as needed
        },

    };

    // Create the language client
    client = new LanguageClient(
        'virtualFabDslLanguageServer', // A unique ID for your language server
        'Virtual Fab DSL Language Server', // A human-readable name
        serverOptions,
        clientOptions
    );

    client.start();

     client.onDidChangeState((event) => {
         if (event.newState === 2) { // 2 corresponds to the 'Running' state
             console.log('Virtual Fab DSL Language Server client is ready.');
             context.subscriptions.push(BPMNEditorProvider.register(context, client)); // Pass the client instance
         } else if (event.newState === 1) { // 1 corresponds to 'Starting' state
             console.log('Virtual Fab DSL Language Server client is starting...');
         } else if (event.newState === 3) { // 3 corresponds to 'Stopped' state
             console.log('Virtual Fab DSL Language Server client is stopped.');
         }
     });


    // Register the "Show Virtual Fab" command (placeholder) - can be registered before LSP client is ready
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.showVirtualFab', () => {
            vscode.window.showInformationMessage('Virtual Fab: Show Virtual Fab command executed.');
        })
    );

    // Register the "Open BPMN Editor" command - can be registered before LSP client is ready
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.bpmn.open', async (uri?: vscode.Uri) => {
            if (!uri) {
                 vscode.window.showErrorMessage('Please select a .bpmn file to open with the BPMN editor.');
                 return;
            }
            try {
                // Explicitly open the specified URI with the custom editor
                await vscode.commands.executeCommand('vscode.openWith', uri, 'virtual-fab.bpmn');
            } catch (error: any) {
                 vscode.window.showErrorMessage(`Failed to open file with BPMN editor: ${error.message}`);
                 console.error('Error opening with custom editor:', error);
            }
        })
    );

    // Register the "Create New BPMN File" command - can be registered before LSP client is ready
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.bpmn.create', async () => {
            const defaultFileName = 'new_bpmn_diagram.bpmn';
            let fileUri: vscode.Uri | undefined;

            // 1. Show a save dialog to let the user choose the location and filename.
            fileUri = await vscode.window.showSaveDialog({
                title: 'Create New BPMN File',
                defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(require('os').homedir()), defaultFileName),
                filters: {
                    'BPMN Files': ['bpmn']
                },
                saveLabel: 'Create'
            });

            if (!fileUri) {
                return;
            }

            if (path.extname(fileUri.fsPath).toLowerCase() !== '.bpmn') {
                fileUri = fileUri.with({ path: fileUri.fsPath + '.bpmn' });
            }

            try {
                //  Write the default BPMN content into the new file.
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(defaultBpmnContent, 'utf8'));

                //  Explicitly open the newly created file using the custom editor.
                await vscode.commands.executeCommand('vscode.openWith', fileUri, 'virtual-fab.bpmn');

            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to create or open BPMN file: ${error.message}`);
                console.error('Error creating or opening BPMN file:', error);
            }
        })
    );

    // Register the new "Open BPMN File..." command - can be registered before LSP client is ready
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.bpmn.browseAndOpen', async () => {
            try {
                // Show an open dialog to let the user select a .bpmn file
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false, // Allow selecting only one file
                    openLabel: 'Open BPMN Diagram',
                    filters: { // Filter file types
                        'BPMN Files': ['bpmn'],
                        'All Files': ['*']
                    }
                };

                const fileUris = await vscode.window.showOpenDialog(options);
                // If the user selected a file
                if (fileUris && fileUris.length > 0) {
                    const selectedFileUri = fileUris[0];

                    await vscode.commands.executeCommand('vscode.openWith', selectedFileUri, 'virtual-fab.bpmn');


                } else {
                    console.log('Open BPMN File cancelled by user.');

                }

            } catch (error: any) {
                // Handle any errors during the process
                vscode.window.showErrorMessage(`Failed to open file dialog or open BPMN file: ${error.message}`);
                console.error('Error in browseAndOpen command:', error);
            }
        })
    );

    // The rest of your activate function continues here...
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    console.log('Stopping Virtual Fab DSL Language Server client.');
    return client.stop();
}


