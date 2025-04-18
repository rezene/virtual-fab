import * as vscode from 'vscode';
import * as path from 'path';
import { BPMNEditorProvider } from './bpmn.editor';

// Define default BPMN content here, referenced by BPMNEditorProvider
// This avoids duplication if you need it elsewhere, although BPMNEditorProvider
// now also defines it for initial webview load fallback.
// If you only need it for file creation, keeping it here is fine.
const defaultNewBpmnContent = `<?xml version="1.0" encoding="UTF-8"?>
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


export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "virtual-fab" is now active!');

	// Register the "Show Virtual Fab" command
	context.subscriptions.push(vscode.commands.registerCommand('virtual-fab.showVirtualFab', () => {
		vscode.window.showInformationMessage('Virtual Fab feature activated!');
	}));

	// Register custom editor for .bpmn files
	const provider = new BPMNEditorProvider(context);
	context.subscriptions.push(vscode.window.registerCustomEditorProvider(BPMNEditorProvider.viewType, provider, {
		supportsMultipleEditorsPerDocument: true,
		// Add this to automatically open .bpmn files with this editor
		// You would typically configure this in your package.json under 'customEditors'
		// If it's in package.json, this option here is not strictly necessary but doesn't hurt.
		// webviewOptions: {
		// 	retainContextWhenHidden: true // Keep the webview alive when switching tabs
		// }
	}));

	// Register command to create a new BPMN file
	context.subscriptions.push(vscode.commands.registerCommand('virtual-fab.bpmn.create', async () => {
		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.parse('untitled.bpmn').with({ scheme: 'untitled' }), // Use 'untitled' scheme for new unsaved files
			filters: {
				'BPMN Files': ['bpmn']
			},
            saveLabel: 'Create BPMN File'
		});

		if (uri) {
			try {
				// If uri scheme is 'untitled', just create a new untitled document
				if (uri.scheme === 'untitled') {
					const document = await vscode.workspace.openTextDocument({
						language: 'xml', // Or a custom BPMN language mode if you have one
						content: defaultNewBpmnContent
					});
                    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
				} else {
					// If a file path is selected, write the content and open
					await vscode.workspace.fs.writeFile(uri, Buffer.from(defaultNewBpmnContent, 'utf8'));
					await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
				}

			} catch (error: any) { // Use any for broader error catching or define specific error types
				vscode.window.showErrorMessage(`Error creating BPMN file: ${error.message || error}`);
				console.error('Error creating BPMN file:', error);
			}
		}
	}));
}

export function deactivate() {
    // Clean-up would typically happen automatically via context.subscriptions.push
    // Add specific cleanup here if needed (e.g., stopping processes)
}