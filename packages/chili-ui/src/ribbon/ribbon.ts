// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { collection, div, label, span, svg } from "chili-controls";
import {
    Binding,
    ButtonSize,
    type CommandKeys,
    CommandUtils,
    Config,
    I18n,
    type IApplication,
    type ICommand,
    type IConverter,
    type IView,
    Localize,
    Logger,
    Observable,
    ObservableCollection,
    PubSub,
    Result,
} from "chili-core";
import { CommandContext } from "./commandContext";
import style from "./ribbon.module.css";
import { RibbonButton } from "./ribbonButton";
import type { RibbonCommandData, RibbonGroupData, RibbonTabData } from "./ribbonData";
import { RibbonStack } from "./ribbonStack";

export class RibbonDataContent extends Observable {
    readonly quickCommands = new ObservableCollection<CommandKeys>();
    readonly ribbonTabs = new ObservableCollection<RibbonTabData>();
    private _activeTab: RibbonTabData;
    private _activeView: IView | undefined;

    constructor(
        readonly app: IApplication,
        quickCommands: CommandKeys[],
        ribbonTabs: RibbonTabData[],
    ) {
        super();
        this.quickCommands.push(...quickCommands);
        this.ribbonTabs.push(...ribbonTabs);
        this._activeTab = ribbonTabs[0];
        PubSub.default.sub("activeViewChanged", (v) => {
            this.activeView = v;
        });
    }

    get activeTab() {
        return this._activeTab;
    }
    set activeTab(value: RibbonTabData) {
        this.setProperty("activeTab", value);
    }

    get activeView() {
        return this._activeView;
    }
    set activeView(value: IView | undefined) {
        this.setProperty("activeView", value);
    }
}

export const QuickButton = (command: ICommand) => {
    const data = CommandUtils.getComandData(command);
    if (!data) {
        Logger.warn("commandData is undefined");
        return span({ textContent: "null" });
    }

    // Hide all save buttons for viewers
    const userPermission = localStorage.getItem("currentUserPermission");
    if (userPermission === "viewer") {
        if (data.key === "doc.save" || data.key === "doc.saveToCloud" || data.key === "doc.saveToFile") {
            return span({ style: { display: "none" } });
        }
    }

    return svg({
        icon: data.icon,
        title: new Localize(`command.${data.key}`),
        onclick: () => PubSub.default.pub("executeCommand", data.key),
    });
};

class ViewActiveConverter implements IConverter<IView> {
    constructor(
        readonly target: IView,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: IView): Result<string> {
        return Result.ok(this.target === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class ActivedRibbonTabConverter implements IConverter<RibbonTabData> {
    constructor(
        readonly tab: RibbonTabData,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: RibbonTabData): Result<string> {
        return Result.ok(this.tab === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class DisplayConverter implements IConverter<RibbonTabData> {
    constructor(readonly tab: RibbonTabData) {}

    convert(value: RibbonTabData): Result<string> {
        return Result.ok(this.tab === value ? "" : "none");
    }
}

export class Ribbon extends HTMLElement {
    private readonly _commandContext = div({ className: style.commandContextPanel });
    private commandContext?: CommandContext;
    private _ribbonTabsEl: HTMLElement | null = null;

    constructor(readonly dataContent: RibbonDataContent) {
        super();
        this.className = style.root;
        this._ribbonTabsEl = this.ribbonTabs();
        this.append(this.header(), this._ribbonTabsEl, this._commandContext);

        // Subscribe to toggle event
        PubSub.default.sub("toggleBottomPanel", this.toggleRibbonControls);
    }

    private readonly toggleRibbonControls = () => {
        if (this._ribbonTabsEl) {
            const isVisible = this._ribbonTabsEl.style.display !== "none";
            this._ribbonTabsEl.style.display = isVisible ? "none" : "";
            this._commandContext.style.display = isVisible ? "none" : "";
        }
    };

    private header() {
        return div({ className: style.titleBar }, this.leftPanel(), this.centerPanel(), this.rightPanel());
    }

    private leftPanel() {
        return div(
            { className: style.left },
            svg({
                className: style.backButton,
                icon: "icon-back",
                title: "Back to Dashboard",
                onclick: () => {
                    window.location.href = "/dashboard";
                },
            }),
            span({ id: "appName", textContent: `Venus - v${__APP_VERSION__}` }),
            div(
                { className: style.ribbonTitlePanel },
                collection({
                    className: style.quickCommands,
                    sources: this.dataContent.quickCommands,
                    template: (command: CommandKeys) => QuickButton(command as any),
                }),
                span({ className: style.split }),
                this.createRibbonHeader(),
            ),
        );
    }

    private createRibbonHeader() {
        return collection({
            sources: this.dataContent.ribbonTabs,
            template: (tab: RibbonTabData) => {
                const converter = new ActivedRibbonTabConverter(tab, style.tabHeader, style.activedTab);
                return label({
                    className: new Binding(this.dataContent, "activeTab", converter),
                    textContent: new Localize(tab.tabName),
                    onclick: () => {
                        this.dataContent.activeTab = tab;
                    },
                });
            },
        });
    }

    private centerPanel() {
        return div(
            { className: style.center },
            collection({
                className: style.views,
                sources: this.dataContent.app.views,
                template: (view) => this.createViewItem(view),
            }),
            svg({
                className: style.new,
                icon: "icon-plus",
                title: I18n.translate("command.doc.new"),
                onclick: () => PubSub.default.pub("executeCommand", "doc.new"),
            }),
        );
    }

    private createViewItem(view: IView) {
        return div(
            {
                className: new Binding(
                    this.dataContent,
                    "activeView",
                    new ViewActiveConverter(view, style.tab, style.active),
                ),
                onclick: () => {
                    this.dataContent.app.activeView = view;
                },
            },
            div({ className: style.name }, span({ textContent: new Binding(view.document, "name") })),
            svg({
                className: style.close,
                icon: "icon-times",
                onclick: (e) => {
                    e.stopPropagation();
                    view.close();
                },
            }),
        );
    }

    private rightPanel() {
        // Create layout toggle buttons (VS Code style)
        const layoutToggles = div(
            { className: style.layoutToggles },
            div({
                className: style.layoutButton,
                title: "Toggle Left Sidebar",
                textContent: "◧",
                onclick: () => PubSub.default.pub("toggleLeftSidebar", true),
            }),
            div({
                className: style.layoutButton,
                title: "Toggle Ribbon Controls",
                textContent: "⬓",
                onclick: () => PubSub.default.pub("toggleBottomPanel", true),
            }),
            div({
                className: style.layoutButton,
                title: "Toggle AI Chat",
                textContent: "◨",
                onclick: () => PubSub.default.pub("toggleAIChat", true),
            }),
        );

        // Add Share button (only for project owners)
        const userPermission = localStorage.getItem("currentUserPermission");
        const shareButton =
            userPermission === "owner" || !userPermission
                ? div({
                      className: style.shareButton,
                      title: "Share Project",
                      textContent: "Share",
                      onclick: () => PubSub.default.pub("openShareDialog", true),
                  })
                : undefined;

        // Add Chat button
        const chatButton = div({
            className: style.shareButton,
            title: "Chat with Collaborators",
            textContent: "Chat",
            onclick: () => {
                PubSub.default.pub<"openChatDialog">("openChatDialog", true);
            },
        });

        // Add Presence Indicators (will be populated by editor)
        const presenceContainer = div({ id: "presence-indicators", className: style.presenceContainer });

        // Build right panel elements, filtering out undefined (for non-owners)
        const elements = [shareButton, chatButton, presenceContainer, layoutToggles].filter(
            (el) => el !== undefined,
        );
        return div({ className: style.right }, ...elements);
    }

    private ribbonTabs() {
        return collection({
            className: style.tabContentPanel,
            sources: this.dataContent.ribbonTabs,
            template: (tab: RibbonTabData) => this.ribbonTab(tab),
        });
    }

    private ribbonTab(tab: RibbonTabData) {
        return collection({
            className: style.groupPanel,
            sources: tab.groups,
            style: {
                display: new Binding(this.dataContent, "activeTab", new DisplayConverter(tab)),
            },
            template: (group: RibbonGroupData) => this.ribbonGroup(group),
        });
    }

    private ribbonGroup(group: RibbonGroupData) {
        return div(
            { className: style.ribbonGroup },
            collection({
                sources: group.items,
                className: style.content,
                template: (item) => this.ribbonButton(item),
            }),
            label({ className: style.header, textContent: new Localize(group.groupName) }),
        );
    }

    private ribbonButton(item: RibbonCommandData) {
        if (typeof item === "string") {
            return RibbonButton.fromCommandName(item, ButtonSize.large)!;
        } else if (item instanceof ObservableCollection) {
            const stack = new RibbonStack();
            item.forEach((b) => {
                const button = RibbonButton.fromCommandName(b, ButtonSize.small);
                if (button) stack.append(button);
            });
            return stack;
        } else {
            return new RibbonButton(item.command, item.icon, ButtonSize.large, item.onClick, item.display);
        }
    }

    connectedCallback(): void {
        PubSub.default.sub("openCommandContext", this.openContext);
        PubSub.default.sub("closeCommandContext", this.closeContext);
        Config.instance.onPropertyChanged(this.handleConfigChanged);
    }

    disconnectedCallback(): void {
        PubSub.default.remove("openCommandContext", this.openContext);
        PubSub.default.remove("closeCommandContext", this.closeContext);
        Config.instance.removePropertyChanged(this.handleConfigChanged);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "navigation3D") {
            this.querySelectorAll(customElements.getName(RibbonButton)!).forEach((x) => {
                (x as RibbonButton).updateShortcut();
            });
        }
    };

    private readonly openContext = (command: ICommand) => {
        if (this.commandContext) {
            this.closeContext();
        }
        this.commandContext = new CommandContext(command);
        this._commandContext.append(this.commandContext);
    };

    private readonly closeContext = () => {
        this.commandContext?.remove();
        this.commandContext?.dispose();
        this.commandContext = undefined;
        this._commandContext.innerHTML = "";
    };
}

customElements.define("chili-ribbon", Ribbon);
