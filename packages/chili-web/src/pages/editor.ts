// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IApplication, IRouter } from "chili-core";
import { auth, Logger, projectService } from "chili-core";

// Helper function to refresh editor UI after permission is set
function refreshEditorUI(app: IApplication) {
    try {
        // Access the editor through the app's mainWindow
        const mainWindow = (app as any).mainWindow;
        if (
            mainWindow &&
            mainWindow._editor &&
            typeof mainWindow._editor.refreshQuickCommands === "function"
        ) {
            Logger.info("[Editor] Refreshing quick commands based on permission");
            mainWindow._editor.refreshQuickCommands();
        } else {
            Logger.warn("[Editor] Could not find editor to refresh commands");
        }
    } catch (error) {
        Logger.error("[Editor] Failed to refresh UI:", error);
    }
}

export async function renderEditor(app: IApplication, _router: IRouter): Promise<void> {
    // Read session ID from URL first, then fall back to localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get("sessionId");

    // Get current user
    const user = auth.currentUser;
    const sessionIdFromStorage = localStorage.getItem("currentSessionId");
    const sessionId = sessionIdFromUrl || sessionIdFromStorage;
    const projectName = localStorage.getItem("currentProjectName") || `Project-${Date.now()}`;

    if (sessionId) {
        localStorage.setItem("currentSessionId", sessionId);
        Logger.info(`Editor opened with session ID: ${sessionId}`);

        // If sessionId is not in URL, add it to maintain state across refreshes
        if (!sessionIdFromUrl && sessionId) {
            const newUrl = `${window.location.pathname}?sessionId=${sessionId}`;
            window.history.replaceState({}, "", newUrl);
            Logger.info(`Added sessionId to URL: ${sessionId}`);
        }
    }

    // Close ALL existing documents first to ensure clean state
    const existingDocs = Array.from(app.documents);
    for (const doc of existingDocs) {
        // Close without prompting - we're switching projects
        const views = app.views.filter((x) => x.document === doc);
        app.views.remove(...views);
        app.documents.delete(doc);
        doc.dispose();
        Logger.info(`Closed existing document: ${doc.name}`);
    }

    // Always try to load from Cloudinary first if we have a session ID
    let loadedFromCloud = false;
    let projectOwnerId: string | null = null;

    if (sessionId) {
        try {
            Logger.info(`Fetching project data for sessionId: ${sessionId}`);

            // Try to get project from current user first
            let project = await projectService.getProject(sessionId);

            // If not found, check if it's a shared project
            if (!project) {
                Logger.info("Project not found in user's projects, checking shares...");
                const { shareService } = await import("chili-core");
                const shares = await shareService.getSharedProjects();
                Logger.info(`Found ${shares.length} shared projects`);
                const share = shares.find((s) => s.projectId === sessionId);

                if (share) {
                    Logger.info(`Found shared project, loading from owner: ${share.sharedBy}`);
                    projectOwnerId = share.sharedBy;
                    project = await projectService.getProjectInfo(sessionId, share.sharedBy);

                    if (project) {
                        Logger.info(`Loaded shared project: ${project.projectName}`);
                        // Store project name and owner ID for display and saving
                        localStorage.setItem("currentProjectName", project.projectName);
                        localStorage.setItem("currentProjectOwnerId", share.sharedBy);
                        // Store user's permission level for this project
                        localStorage.setItem("currentUserPermission", share.permission);
                        Logger.info(`User permission for this project: ${share.permission}`);

                        // Refresh UI to reflect permission changes
                        refreshEditorUI(app);
                    } else {
                        Logger.error("Failed to load project info from owner");
                    }
                } else {
                    Logger.warn("No share found for this project");
                }
            } else {
                Logger.info(`Loaded own project: ${project.projectName}`);
                projectOwnerId = project.userId || user.uid; // Fallback to current user if userId is missing
                localStorage.setItem("currentProjectName", project.projectName);
                localStorage.setItem("currentProjectOwnerId", projectOwnerId);
                // Owner has full editor permissions
                localStorage.setItem("currentUserPermission", "owner");

                // Refresh UI to reflect permission changes
                refreshEditorUI(app);

                // Debug log
                console.log("Setting ownerId in localStorage:", projectOwnerId);
                console.log("project.userId:", project.userId);
                console.log("user.uid:", user.uid);
            }

            Logger.info(`Project data:`, project);

            if (project?.fileUrl) {
                Logger.info(`Loading project from Cloudinary: ${project.fileUrl}`);
                const response = await fetch(project.fileUrl);
                Logger.info(`Cloudinary fetch response status: ${response.status}`);

                if (response.ok) {
                    const json = await response.json();
                    Logger.info(`Loaded JSON from Cloudinary, document name: ${json.properties?.name}`);

                    // Override the document ID with sessionId to ensure unique storage per project
                    json.properties.id = sessionId;
                    await app.loadDocument(json);
                    loadedFromCloud = true;
                    Logger.info("Project loaded from cloud successfully");
                } else {
                    const errorText = await response.text();
                    Logger.warn(
                        `Failed to fetch project file: ${response.status} ${response.statusText}`,
                        errorText,
                    );
                }
            } else {
                Logger.info("No fileUrl found for project, creating new document");
            }
        } catch (error) {
            Logger.error("Failed to load project from cloud:", error);
            console.error("Load error details:", error);
        }
    }

    // Only create a new document if we didn't load from cloud
    if (!loadedFromCloud) {
        const docName = projectName;
        // Create document using the Document class directly with sessionId
        const { Document } = await import("chili");
        const doc = new Document(app, docName, sessionId);
        const { Material } = await import("chili-core");
        const lightGray = new Material(doc, "LightGray", 0xdedede);
        const deepGray = new Material(doc, "DeepGray", 0x898989);
        doc.modelManager.materials.push(lightGray, deepGray);

        // Create view for the document
        const { Plane } = await import("chili-core");
        const view = doc.visual.createView("3d", Plane.XY);
        app.activeView = view;

        Logger.info(`Created new document: ${docName} with ID: ${sessionId}`);
    }

    // Make sure we have an active view
    if (!app.activeView && app.views.items.length > 0) {
        app.activeView = app.views.items[0];
    }

    // Setup real-time sync for collaborative editing
    if (sessionId && projectOwnerId) {
        setupRealtimeSync(app, sessionId, projectOwnerId);
    }
}

// Track last update timestamp to avoid reloading our own saves
let lastUpdateTimestamp: number = 0;
let syncUnsubscribe: (() => void) | null = null;

async function setupRealtimeSync(app: IApplication, sessionId: string, ownerId: string): Promise<void> {
    try {
        const { projectSyncService, auth } = await import("chili-core");
        const currentUser = auth.currentUser;

        if (!currentUser) {
            Logger.warn("No authenticated user, skipping real-time sync");
            return;
        }

        // Unsubscribe from previous sync if exists
        if (syncUnsubscribe) {
            syncUnsubscribe();
            syncUnsubscribe = null;
        }

        Logger.info(`Setting up real-time sync for project: ${sessionId}`);

        // Track if this is the first update (initial load)
        let isFirstUpdate = true;

        syncUnsubscribe = projectSyncService.subscribeToProjectUpdates(
            sessionId,
            ownerId,
            async (fileUrl: string, lastModified: any) => {
                // Skip the first update (that's our initial load)
                if (isFirstUpdate) {
                    isFirstUpdate = false;
                    lastUpdateTimestamp = lastModified?.toMillis?.() || Date.now();
                    Logger.info("Initial project state loaded, watching for updates...");
                    return;
                }

                const updateTime = lastModified?.toMillis?.() || Date.now();

                // Only reload if this is a new update (not our own save)
                if (updateTime > lastUpdateTimestamp) {
                    lastUpdateTimestamp = updateTime;
                    Logger.info(`Project updated by another user, reloading model from: ${fileUrl}`);

                    try {
                        // Fetch the updated model
                        const response = await fetch(fileUrl);
                        if (response.ok) {
                            const json = await response.json();

                            // Close current document
                            const existingDocs = Array.from(app.documents);
                            for (const doc of existingDocs) {
                                const views = app.views.filter((x) => x.document === doc);
                                app.views.remove(...views);
                                app.documents.delete(doc);
                                doc.dispose();
                            }

                            // Load updated document
                            json.properties.id = sessionId;
                            await app.loadDocument(json);

                            // Restore active view
                            if (!app.activeView && app.views.items.length > 0) {
                                app.activeView = app.views.items[0];
                            }

                            Logger.info("Model reloaded successfully with latest changes");

                            // Show toast notification
                            const { PubSub } = await import("chili-core");
                            PubSub.default.pub("showToast", "toast.projectUpdated");
                        } else {
                            Logger.error(`Failed to fetch updated model: ${response.status}`);
                        }
                    } catch (error) {
                        Logger.error("Failed to reload updated model:", error);
                    }
                }
            },
        );

        Logger.info("Real-time sync enabled");
    } catch (error) {
        Logger.error("Failed to setup real-time sync:", error);
    }
}

// Cleanup function to unsubscribe when leaving editor
export function cleanupRealtimeSync(): void {
    if (syncUnsubscribe) {
        syncUnsubscribe();
        syncUnsubscribe = null;
        Logger.info("Real-time sync disabled");
    }
}
