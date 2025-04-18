import * as vscode from 'vscode';
import * as path from 'path';
import { BPMNEditorProvider } from './bpmn.editor';

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
  }));
  // Register command to open BPMN editor (though the custom editor should handle this)
  context.subscriptions.push(vscode.commands.registerCommand('virtual-fab.bpmn.open', (uri: vscode.Uri) => {
    vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
  }));

  // Register command to create a new BPMN file
  context.subscriptions.push(vscode.commands.registerCommand('virtual-fab.bpmn.create', async () => {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.parse('untitled.bpmn'),
      filters: {
        'BPMN Files': ['bpmn']
      }
    });
    if (uri) {
      try {
        const defaultContent = `<?xml version="1.0" encoding="UTF-8"?>
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
        await vscode.workspace.fs.writeFile(uri, Buffer.from(defaultContent, 'utf8'));
        await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.One });
      } catch (error) {
        vscode.window.showErrorMessage(`Error creating BPMN file: ${error}`);
      }
    }
  }));
}

export function deactivate() {}