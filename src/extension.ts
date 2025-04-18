// src/extension.ts
import * as vscode from 'vscode';
import { BPMNEditorProvider } from './bpmn.editor';

const defaultBpmnContent = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
</bpmn:definitions>`;

export function activate(context: vscode.ExtensionContext) {
    // Register the custom BPMN editor
    context.subscriptions.push(BPMNEditorProvider.register(context));

    // Register the "Show Virtual Fab" command (placeholder)
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.showVirtualFab', () => {
            vscode.window.showInformationMessage('Virtual Fab: Show Virtual Fab command executed.');
        })
    );

    // Register the "Open BPMN Editor" command
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.bpmn.open', async (uri: vscode.Uri) => {
            if (uri) {
                await vscode.commands.executeCommand('vscode.openWith', uri, 'virtual-fab.bpmn');
            } else {
                vscode.window.showErrorMessage('Please select a .bpmn file to open.');
            }
        })
    );

    // Register the "Create New BPMN File" command
    context.subscriptions.push(
        vscode.commands.registerCommand('virtual-fab.bpmn.create', async () => {
            const newFile = await vscode.workspace.openTextDocument({ language: 'xml', content: defaultBpmnContent });
            await vscode.window.showTextDocument(newFile);
            await vscode.commands.executeCommand('vscode.openWith', newFile.uri, 'virtual-fab.bpmn');
        })
    );
}

export function deactivate() {}