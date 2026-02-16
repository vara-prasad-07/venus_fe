// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { accessRequestService, auth, type IRouter, projectService, shareService } from "chili-core";

export async function renderRequestAccess(router: IRouter): Promise<void> {
    const container = document.getElementById("app") || document.body;
    container.innerHTML = "";
    container.className = "";
    container.style.cssText = "";

    // Get sessionId, owner, and project name from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("sessionId") || urlParams.get("session");
    const ownerIdFromUrl = urlParams.get("owner");
    const projectNameFromUrl = urlParams.get("name");

    if (!sessionId) {
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;">
                <div style="text-align:center;">
                    <h1>Invalid Link</h1>
                    <p>This shared link is invalid or expired.</p>
                    <button onclick="window.location.href='/dashboard'" style="margin-top:20px;padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;">
                        Go to Dashboard
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        // Redirect to login with return URL
        const returnUrl = `/request-access?sessionId=${sessionId}`;
        router.navigate(`/login?redirect=${encodeURIComponent(returnUrl)}`);
        return;
    }

    // Check if user already has access
    try {
        const shares = await shareService.getSharedProjects();
        const hasAccess = shares.some((share) => share.projectId === sessionId);

        if (hasAccess) {
            // User already has access, redirect to editor
            router.navigate(`/editor?sessionId=${sessionId}`);
            return;
        }
    } catch (error) {
        console.error("Failed to check access:", error);
    }

    // Get project info - need to find the owner
    const ownerId = ownerIdFromUrl || "";

    if (!ownerId) {
        // No owner in URL, show helpful message
        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                <div style="max-width:500px;text-align:center;padding:40px;">
                    <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 24px;color:#ef4444;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h1 style="margin:0 0 16px 0;font-size:28px;font-weight:600;">Invalid Share Link</h1>
                    <p style="margin:0 0 24px 0;color:#888;font-size:16px;line-height:1.6;">
                        This share link is outdated or incomplete. Please ask the project owner to generate a new share link from the Share dialog.
                    </p>
                    <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px;margin-bottom:24px;text-align:left;">
                        <div style="font-weight:500;margin-bottom:8px;color:#ef4444;">Why is this happening?</div>
                        <div style="color:#ccc;font-size:14px;line-height:1.5;">
                            The share link needs to include the project owner's information. The owner should:
                            <ol style="margin:8px 0 0 20px;padding:0;">
                                <li>Open the project</li>
                                <li>Click the Share button</li>
                                <li>Copy the new share link</li>
                                <li>Send it to you</li>
                            </ol>
                        </div>
                    </div>
                    <button onclick="window.location.href='/dashboard'" style="padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:500;cursor:pointer;">
                        Go to Dashboard
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Get project name - prefer URL parameter, then try to load from Firestore
    let projectName = projectNameFromUrl ? decodeURIComponent(projectNameFromUrl) : "Shared Project";

    // Try to get more project info if we can (but don't fail if we can't)
    if (!projectNameFromUrl) {
        try {
            console.log("Loading project info from owner:", ownerId);
            const project = await projectService.getProjectInfo(sessionId, ownerId);
            if (project) {
                projectName = project.projectName;
            }
        } catch (error) {
            console.log("Could not load project name (expected due to security rules):", error);
            // Continue with default name
        }
    }

    // Render request access page
    const page = document.createElement("div");
    page.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    page.innerHTML = `
        <div style="max-width:500px;width:100%;padding:40px;background:rgba(255,255,255,0.05);backdrop-filter:blur(10px);border-radius:16px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="text-align:center;margin-bottom:32px;">
                <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 16px;color:#3b82f6;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h1 style="margin:0 0 8px 0;font-size:28px;font-weight:600;">Access Required</h1>
                <p style="margin:0;color:#888;font-size:14px;">You need permission to access this project</p>
            </div>

            <div style="background:rgba(255,255,255,0.03);padding:20px;border-radius:12px;margin-bottom:24px;border:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <div>
                        <div style="font-weight:500;font-size:16px;">${escapeHtml(projectName)}</div>
                        <div style="color:#888;font-size:12px;">Shared project</div>
                    </div>
                </div>
            </div>

            <div style="margin-bottom:24px;">
                <label style="display:block;margin-bottom:8px;font-size:14px;color:#ccc;">Message (optional)</label>
                <textarea id="access-message" placeholder="Why do you need access?" style="width:100%;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-family:inherit;font-size:14px;resize:vertical;min-height:80px;" rows="3"></textarea>
            </div>

            <button id="request-btn" style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:500;cursor:pointer;transition:background 0.2s;">
                Request Access
            </button>

            <div id="status-message" style="margin-top:16px;padding:12px;border-radius:8px;display:none;"></div>

            <div style="text-align:center;margin-top:24px;">
                <a href="/dashboard" style="color:#888;text-decoration:none;font-size:14px;transition:color 0.2s;">
                    ← Back to Dashboard
                </a>
            </div>
        </div>
    `;

    container.appendChild(page);

    // Add event listeners
    const requestBtn = document.getElementById("request-btn") as HTMLButtonElement;
    const messageInput = document.getElementById("access-message") as HTMLTextAreaElement;
    const statusMessage = document.getElementById("status-message") as HTMLDivElement;

    requestBtn.addEventListener("click", async () => {
        requestBtn.disabled = true;
        requestBtn.textContent = "Requesting...";

        try {
            const message = messageInput.value.trim();

            if (!ownerId) {
                throw new Error(
                    "Could not determine project owner. Please ask the owner to share the project with you first.",
                );
            }

            await accessRequestService.requestAccess(sessionId, ownerId, "editor", message || undefined);

            statusMessage.style.display = "block";
            statusMessage.style.background = "rgba(16, 185, 129, 0.1)";
            statusMessage.style.border = "1px solid rgba(16, 185, 129, 0.3)";
            statusMessage.style.color = "#10b981";
            statusMessage.textContent = "✓ Access request sent! You'll be notified when the owner responds.";

            requestBtn.textContent = "Request Sent";
            requestBtn.style.background = "#10b981";

            // Redirect to dashboard after 3 seconds
            setTimeout(() => {
                router.navigate("/dashboard");
            }, 3000);
        } catch (error) {
            console.error("Failed to request access:", error);

            statusMessage.style.display = "block";
            statusMessage.style.background = "rgba(239, 68, 68, 0.1)";
            statusMessage.style.border = "1px solid rgba(239, 68, 68, 0.3)";
            statusMessage.style.color = "#ef4444";
            statusMessage.textContent = "✗ Failed to send request. Please try again.";

            requestBtn.disabled = false;
            requestBtn.textContent = "Request Access";
        }
    });
}

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
