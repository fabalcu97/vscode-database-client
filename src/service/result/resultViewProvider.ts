import { EventEmitter } from "events";
import * as vscode from "vscode";
import { Console } from "../../common/Console";
import { Hanlder, ViewManager } from "../../common/viewManager";

/**
 * Hosts the query result webview in the bottom panel (a WebviewView).
 * Mirrors the ViewManager protocol: the webview sends `init` once loaded, then
 * every message is routed to the event handler of the latest query.
 */
export class ResultViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = "github.cweijan.result";
    private static readonly focusCommand = `${ResultViewProvider.viewType}.focus`;

    private view?: vscode.WebviewView;
    private creating = false;
    private eventHandler?: (handler: Hanlder<vscode.WebviewView>) => void;
    private readonly eventEmitter = new EventEmitter();

    public static register(): vscode.Disposable {
        const provider = new ResultViewProvider();
        ResultViewProvider.instance = provider;
        return vscode.window.registerWebviewViewProvider(ResultViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        });
    }

    private static instance?: ResultViewProvider;

    /**
     * Show the result view and bind the given handler, reusing the view if it exists.
     */
    public static show(eventHandler: (handler: Hanlder<vscode.WebviewView>) => void): Promise<void> {
        return ResultViewProvider.instance.show(eventHandler);
    }

    public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
        this.view = view;
        this.creating = true;
        view.onDidDispose(() => {
            if (this.view === view) { this.view = undefined; }
        });
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(ViewManager.webviewRoot)],
        };
        view.webview.onDidReceiveMessage((message) => {
            if (message.type == 'init') {
                if (this.creating) {
                    this.eventEmitter.emit(message.type, message.content);
                    this.creating = false;
                }
            } else {
                this.eventEmitter.emit(message.type, message.content);
            }
        });
        try {
            view.webview.html = await ViewManager.renderHtml("result", view.webview);
        } catch (err) {
            Console.log(err);
            return;
        }
        // the view was re-created (e.g. closed and reopened), rebind the last handler to it.
        if (this.eventHandler) {
            this.bind(this.eventHandler);
        }
    }

    private async show(eventHandler: (handler: Hanlder<vscode.WebviewView>) => void): Promise<void> {
        this.eventHandler = eventHandler;
        if (!this.view) {
            // VS Code resolves the view (and rebinds the handler) once it is opened.
            await vscode.commands.executeCommand(ResultViewProvider.focusCommand);
            return;
        }
        this.view.show(true);
        this.bind(eventHandler);
        if (!this.creating) {
            this.eventEmitter.emit('init');
        }
    }

    private bind(eventHandler: (handler: Hanlder<vscode.WebviewView>) => void) {
        this.eventEmitter.removeAllListeners();
        eventHandler(new Hanlder(this.view, this.eventEmitter));
    }

}
