import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce } from './util';

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
//console.log('Content of BPMN file:', document.getText());
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist')),
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };
    webviewPanel.webview.html = this._getWebviewContent(webviewPanel.webview, document.uri);

    // Read out current document content
    function updateWebview() {
      webviewPanel.webview.postMessage({
        command: 'loadXml',
        xml: document.getText(),
      });
    }

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
          updateWebview();
          return;
      }
    });

    // Make sure we get updated whenever the document is saved
    const saveSubscription = vscode.workspace.onDidSaveTextDocument(document => {
      updateWebview();
    });

    // When the webview is closed, dispose of the subscriptions
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      saveSubscription.dispose();
    });

    // Immediately send the current document content to the webview
    updateWebview();
  }

  private _getWebviewContent(webview: vscode.Webview, resource: vscode.Uri) {
    const bpmnJsUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist', 'bpmn-navigated-viewer.development.js')
    ));
    const bpmnCssUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this.context.extensionPath, 'node_modules', 'bpmn-js', 'dist', 'assets', 'bpmn-js.css')
    ));
    const diagramCssUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this.context.extensionPath, 'media', 'diagram.css')
    ));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Virtual Fab BPMN Editor</title>
       <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src data:; font-src ${webview.cspSource};">
      <link rel="stylesheet" type="text/css" href="${bpmnCssUri}">
      <link rel="stylesheet" type="text/css" href="${diagramCssUri}">
      <style>
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
        }
        #container {
          height: 800px;
          width: 100%;
          margin: 0;
          padding: 10px; /* Add some padding */
          overflow: auto;
          display: flex; /* Use flexbox to control viewer size */
          align-items: flex-start; /* Align items to the start to prevent stretching */
        }
        .bjs-container { /* Target the BPMN viewer's main container */
          height: auto !important; /* Let it expand based on content */
          width: auto !important; /* Let it expand based on content */
        }
      </style>
    </head>
    <body>
      <div id="container"></div>

    <script src="${bpmnJsUri}"></script>

      <script>
        const container = document.getElementById('container');
        let bpmnViewer;
        let vscode;
        const defaultBpmnContent = \`<?xml version="1.0" encoding="UTF-8"?>
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
        </bpmn:definitions>\`;

        window.addEventListener('load', () => {
          vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'ready' });
          initBpmnViewer();
        });

        function initBpmnViewer(xml = defaultBpmnContent) {
          if (!bpmnViewer) {
            bpmnViewer = new BpmnJS({ container: '#container' }); // Changed to BpmnJS
          }
          bpmnViewer.importXML(xml)
            .then(() => {
              console.log('XML loaded successfully!');
            })
            .catch(err => console.error('Error loading XML', err));
        }

        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.command) {
            case 'loadXml':
              initBpmnViewer(message.xml);
              break;
          }
        });
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