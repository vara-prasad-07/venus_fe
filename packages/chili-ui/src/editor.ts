// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { div } from "chili-controls";
import {
    type AsyncController,
    type Button,
    type CommandKeys,
    type I18nKeys,
    type IApplication,
    type IDocument,
    type Material,
    PubSub,
    type RibbonTab,
} from "chili-core";
import { AIChatPanel } from "./aiChat";
import { CommentsPanel, PresenceIndicators, ShareDialog } from "./collaboration";
import { ChatDialog } from "./collaboration/chatDialog";
import style from "./editor.module.css";
import { OKCancel } from "./okCancel";
import { ProjectView } from "./project";
import { PropertyView } from "./property";
import { MaterialDataContent, MaterialEditor } from "./property/material";
import { Ribbon, RibbonDataContent } from "./ribbon";
import { RibbonTabData } from "./ribbon/ribbonData";
import { Statusbar } from "./statusbar";
import { LayoutViewport } from "./viewport";

const allQuickCommands: CommandKeys[] = [
    "doc.save",
    "doc.saveToFile",
    "doc.saveToCloud",
    "edit.undo",
    "edit.redo",
];

// Filter quick commands based on user permission
function getFilteredQuickCommands(): CommandKeys[] {
    const userPermission = localStorage.getItem("currentUserPermission");
    console.log("[Editor] Filtering quick commands, permission:", userPermission);
    if (userPermission === "viewer") {
        // Remove all save commands for viewers
        const filtered = allQuickCommands.filter(
            (cmd) => cmd !== "doc.save" && cmd !== "doc.saveToFile" && cmd !== "doc.saveToCloud",
        );
        console.log("[Editor] Viewer detected, filtered commands:", filtered);
        return filtered;
    }
    console.log("[Editor] Editor/Owner, showing all commands:", allQuickCommands);
    return allQuickCommands;
}

export class Editor extends HTMLElement {
    readonly ribbonContent: RibbonDataContent;
    private readonly _selectionController: OKCancel;
    private readonly _viewportContainer: HTMLDivElement;
    private _sidebarWidth: number = 360;
    private _isResizingSidebar: boolean = false;
    private _sidebarEl: HTMLDivElement | null = null;
    private _isSidebarVisible: boolean = true;
    private _aiChatPanel: AIChatPanel | null = null;
    private _isAIChatVisible: boolean = true;
    private _commentsPanel: CommentsPanel | null = null;
    private _presenceIndicators: PresenceIndicators | null = null;
    private _currentProjectId: string | null = null;

    constructor(
        readonly app: IApplication,
        tabs: RibbonTab[],
    ) {
        super();
        const quickCommands = getFilteredQuickCommands();
        this.ribbonContent = new RibbonDataContent(app, quickCommands, tabs.map(RibbonTabData.fromProfile));
        const viewport = new LayoutViewport(app);
        viewport.classList.add(style.viewport);
        this._selectionController = new OKCancel();
        this._viewportContainer = div(
            { className: style.viewportContainer },
            this._selectionController,
            viewport,
        );
        this.clearSelectionControl();

        // Get project ID from URL (check both 'session' and 'sessionId' for compatibility)
        const urlParams = new URLSearchParams(window.location.search);
        this._currentProjectId = urlParams.get("session") || urlParams.get("sessionId");

        // Also check localStorage as fallback
        if (!this._currentProjectId) {
            this._currentProjectId = localStorage.getItem("currentSessionId");
        }

        console.log("Editor initialized with project ID:", this._currentProjectId);

        this.render();
    }

    private render() {
        this._sidebarEl = div(
            {
                className: style.sidebar,
                style: `width: ${this._sidebarWidth}px;`,
            },
            new ProjectView({ className: style.sidebarItem }),
            new PropertyView({ className: style.sidebarItem }),
            div({
                className: style.sidebarResizer,
                onmousedown: (e: MouseEvent) => this._startSidebarResize(e),
            }),
        );

        // Create AI chat panel and show it by default
        // Pass the project session ID so WebSocket connects with the correct ID
        this._aiChatPanel = new AIChatPanel(this.app, this._currentProjectId ?? undefined);
        this._aiChatPanel.style.display = "flex";

        // Create comments panel if we have a project ID
        if (this._currentProjectId) {
            this._commentsPanel = new CommentsPanel(this._currentProjectId);
            this._commentsPanel.style.display = "none";
            this._commentsPanel.style.width = "400px";
            this._commentsPanel.style.borderLeft = "1px solid #2a2a2a";
        }

        this.append(
            div(
                { className: style.root },
                new Ribbon(this.ribbonContent),
                div(
                    { className: style.content },
                    this._sidebarEl,
                    this._viewportContainer,
                    this._commentsPanel || div(),
                    this._aiChatPanel,
                ),
                new Statusbar(style.statusbar),
            ),
        );
        this.app.mainWindow?.appendChild(this);

        // Add presence indicators to ribbon if we have a project ID
        if (this._currentProjectId) {
            this._presenceIndicators = new PresenceIndicators(this._currentProjectId);
            const presenceContainer = document.getElementById("presence-indicators");
            if (presenceContainer) {
                presenceContainer.appendChild(this._presenceIndicators);
            }
        }
    }

    private _startSidebarResize(e: MouseEvent) {
        e.preventDefault();
        this._isResizingSidebar = true;
        if (this.app.mainWindow) this.app.mainWindow.style.cursor = "ew-resize";
        const onMouseMove = (ev: MouseEvent) => {
            if (!this._isResizingSidebar) return;
            if (!this._sidebarEl) return;
            const sidebarRect = this._sidebarEl.getBoundingClientRect();
            let newWidth = ev.clientX - sidebarRect.left;
            const minWidth = 75;
            const maxWidth = Math.floor(window.innerWidth * 0.85);
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            this._sidebarWidth = newWidth;
            this._sidebarEl.style.width = `${newWidth}px`;
        };
        const onMouseUp = () => {
            this._isResizingSidebar = false;
            if (this.app.mainWindow) this.app.mainWindow.style.cursor = "";
            this.app.mainWindow?.removeEventListener("mousemove", onMouseMove);
            this.app.mainWindow?.removeEventListener("mouseup", onMouseUp);
        };
        this.app.mainWindow?.addEventListener("mousemove", onMouseMove);
        this.app.mainWindow?.addEventListener("mouseup", onMouseUp);
    }

    connectedCallback(): void {
        PubSub.default.sub("showSelectionControl", this.showSelectionControl);
        PubSub.default.sub("editMaterial", this._handleMaterialEdit);
        PubSub.default.sub("clearSelectionControl", this.clearSelectionControl);
        PubSub.default.sub("toggleLeftSidebar", this._toggleSidebar);
        PubSub.default.sub("toggleAIChat", this._toggleAIChat);
        PubSub.default.sub("openShareDialog", this._openShareDialog);
        PubSub.default.sub("openChatDialog", this._openChatDialog);
    }

    disconnectedCallback(): void {
        PubSub.default.remove("showSelectionControl", this.showSelectionControl);
        PubSub.default.remove("editMaterial", this._handleMaterialEdit);
        PubSub.default.remove("clearSelectionControl", this.clearSelectionControl);
        PubSub.default.remove("toggleLeftSidebar", this._toggleSidebar);
        PubSub.default.remove("toggleAIChat", this._toggleAIChat);
        PubSub.default.remove("openShareDialog", this._openShareDialog);
        PubSub.default.remove("openChatDialog", this._openChatDialog);
    }

    private readonly _openShareDialog = async () => {
        if (!this._currentProjectId) {
            this.showCustomAlert("No project loaded. Please create or open a project first.");
            return;
        }

        const projectName = localStorage.getItem("currentProjectName") || "Untitled Project";

        // Get current user ID as owner
        const { auth } = await import("chili-core");
        const ownerId = auth.currentUser?.uid;

        const dialog = new ShareDialog(this._currentProjectId, projectName, ownerId);

        // Create backdrop
        const backdrop = div({
            style: "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 9998; display: flex; align-items: center; justify-content: center;",
        });

        backdrop.appendChild(dialog);
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
            }
        });

        document.body.appendChild(backdrop);
    };

    private readonly _openChatDialog = async () => {
        if (!this._currentProjectId) {
            this.showCustomAlert("No project loaded. Please create or open a project first.");
            return;
        }

        const dialog = new ChatDialog(this._currentProjectId);
        dialog.show();
        document.body.appendChild(dialog);
    };

    private showCustomAlert(message: string): void {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: linear-gradient(135deg, rgba(30, 30, 30, 0.98), rgba(20, 20, 20, 0.98));
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 32px;
            min-width: 400px;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            text-align: center;
        `;

        dialog.innerHTML = `
            <div style="
                width: 64px;
                height: 64px;
                margin: 0 auto 20px;
                background: rgba(239, 68, 68, 0.1);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <svg width="32" height="32" fill="none" stroke="#ef4444" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <p style="color: #fff; font-size: 1rem; margin: 0 0 24px 0; line-height: 1.5;">${message}</p>
            <button id="custom-alert-ok" style="
                padding: 10px 32px;
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                border-radius: 8px;
                color: #fff;
                font-size: 0.9375rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            ">OK</button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const okBtn = document.getElementById("custom-alert-ok");
        okBtn?.addEventListener("mouseenter", () => {
            okBtn.style.transform = "translateY(-1px)";
            okBtn.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.4)";
        });
        okBtn?.addEventListener("mouseleave", () => {
            okBtn.style.transform = "";
            okBtn.style.boxShadow = "";
        });

        const cleanup = () => {
            overlay.style.animation = "fadeOut 0.2s ease";
            setTimeout(() => overlay.remove(), 200);
        };

        okBtn?.addEventListener("click", cleanup);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cleanup();
        });
    }

    private readonly showSelectionControl = (controller: AsyncController) => {
        this._selectionController.setControl(controller);
        this._selectionController.style.visibility = "visible";
        this._selectionController.style.zIndex = "1000";
    };

    private readonly clearSelectionControl = () => {
        this._selectionController.setControl(undefined);
        this._selectionController.style.visibility = "hidden";
    };

    private readonly _handleMaterialEdit = (
        document: IDocument,
        editingMaterial: Material,
        callback: (material: Material) => void,
    ) => {
        const context = new MaterialDataContent(document, callback, editingMaterial);
        this._viewportContainer.append(new MaterialEditor(context));
    };

    registerRibbonCommand(tabName: I18nKeys, groupName: I18nKeys, command: CommandKeys | Button) {
        const tab = this.ribbonContent.ribbonTabs.find((p) => p.tabName === tabName);
        const group = tab?.groups.find((p) => p.groupName === groupName);
        group?.items.push(command);
    }

    refreshQuickCommands() {
        // Clear existing quick commands
        this.ribbonContent.quickCommands.clear();
        // Re-add filtered commands based on current permission
        const filtered = getFilteredQuickCommands();
        console.log("[Editor] Refreshing quick commands with:", filtered);
        this.ribbonContent.quickCommands.push(...filtered);
    }

    private readonly _toggleSidebar = () => {
        this._isSidebarVisible = !this._isSidebarVisible;
        if (this._sidebarEl) {
            this._sidebarEl.style.display = this._isSidebarVisible ? "flex" : "none";
        }
    };

    private readonly _toggleAIChat = () => {
        this._isAIChatVisible = !this._isAIChatVisible;
        if (this._aiChatPanel) {
            this._aiChatPanel.style.display = this._isAIChatVisible ? "flex" : "none";
            // When showing the panel, ensure WebSocket is connected with the correct session ID.
            // The session ID may have changed since the panel was created (e.g., user navigated
            // from dashboard to editor after the panel was constructed during app startup).
            if (this._isAIChatVisible) {
                this._aiChatPanel.ensureConnection();
            }
        }
    };
}

customElements.define("chili-editor", Editor);
