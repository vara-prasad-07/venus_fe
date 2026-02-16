// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { auth, authService, db, type IApplication, type IRouter, projectService } from "chili-core";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// ─── Custom Dialog System ───────────────────────────────────────────────

function showCustomPrompt(title: string, defaultValue: string = ""): Promise<string | null> {
    return new Promise((resolve) => {
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
        `;

        dialog.innerHTML = `
            <h3 style="color: #fff; font-size: 1.25rem; margin: 0 0 20px 0; font-weight: 500;">${title}</h3>
            <input type="text" id="custom-prompt-input" value="${defaultValue}" style="
                width: 100%;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #fff;
                font-size: 0.9375rem;
                outline: none;
                transition: all 0.2s ease;
                box-sizing: border-box;
            " />
            <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
                <button id="custom-prompt-cancel" style="
                    padding: 10px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Cancel</button>
                <button id="custom-prompt-ok" style="
                    padding: 10px 24px;
                    background: linear-gradient(135deg, #10B981, #059669);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Create</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = document.getElementById("custom-prompt-input") as HTMLInputElement;
        const okBtn = document.getElementById("custom-prompt-ok");
        const cancelBtn = document.getElementById("custom-prompt-cancel");

        input.focus();
        input.select();

        // Hover effects
        okBtn?.addEventListener("mouseenter", () => {
            okBtn.style.transform = "translateY(-1px)";
            okBtn.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.4)";
        });
        okBtn?.addEventListener("mouseleave", () => {
            okBtn.style.transform = "";
            okBtn.style.boxShadow = "";
        });

        cancelBtn?.addEventListener("mouseenter", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.08)";
        });
        cancelBtn?.addEventListener("mouseleave", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.05)";
        });

        input.addEventListener("focus", () => {
            input.style.borderColor = "#10B981";
            input.style.background = "rgba(255, 255, 255, 0.08)";
        });
        input.addEventListener("blur", () => {
            input.style.borderColor = "rgba(255, 255, 255, 0.1)";
            input.style.background = "rgba(255, 255, 255, 0.05)";
        });

        const cleanup = () => {
            overlay.style.animation = "fadeOut 0.2s ease";
            setTimeout(() => overlay.remove(), 200);
        };

        okBtn?.addEventListener("click", () => {
            resolve(input.value.trim() || null);
            cleanup();
        });

        cancelBtn?.addEventListener("click", () => {
            resolve(null);
            cleanup();
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                resolve(input.value.trim() || null);
                cleanup();
            } else if (e.key === "Escape") {
                resolve(null);
                cleanup();
            }
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                resolve(null);
                cleanup();
            }
        });
    });
}

function showCustomAlert(message: string, type: "success" | "error" | "info" = "info"): Promise<void> {
    return new Promise((resolve) => {
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

        const colors = {
            success: { icon: "#10B981", bg: "rgba(16, 185, 129, 0.1)" },
            error: { icon: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
            info: { icon: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
        };

        const icons = {
            success: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />`,
            error: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />`,
            info: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`,
        };

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
                background: ${colors[type].bg};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <svg width="32" height="32" fill="none" stroke="${colors[type].icon}" viewBox="0 0 24 24">
                    ${icons[type]}
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
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 200);
        };

        okBtn?.addEventListener("click", cleanup);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) cleanup();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === "Escape") cleanup();
        });
    });
}

function showCustomConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
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
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="custom-confirm-cancel" style="
                    padding: 10px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Cancel</button>
                <button id="custom-confirm-ok" style="
                    padding: 10px 24px;
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Confirm</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const okBtn = document.getElementById("custom-confirm-ok");
        const cancelBtn = document.getElementById("custom-confirm-cancel");

        okBtn?.addEventListener("mouseenter", () => {
            okBtn.style.transform = "translateY(-1px)";
            okBtn.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.4)";
        });
        okBtn?.addEventListener("mouseleave", () => {
            okBtn.style.transform = "";
            okBtn.style.boxShadow = "";
        });

        cancelBtn?.addEventListener("mouseenter", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.08)";
        });
        cancelBtn?.addEventListener("mouseleave", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.05)";
        });

        const cleanup = () => {
            overlay.style.animation = "fadeOut 0.2s ease";
            setTimeout(() => overlay.remove(), 200);
        };

        okBtn?.addEventListener("click", () => {
            resolve(true);
            cleanup();
        });

        cancelBtn?.addEventListener("click", () => {
            resolve(false);
            cleanup();
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                resolve(false);
                cleanup();
            }
        });
    });
}

export function renderDashboard(_app: IApplication, router: IRouter): void {
    const container = document.getElementById("app") || document.body;
    container.innerHTML = "";
    container.className = "";
    container.style.cssText = "";

    const username = localStorage.getItem("username") || "User";

    const page = document.createElement("div");
    page.className = "modern-dashboard";
    page.innerHTML = `
        <!-- Sidebar -->
        <aside class="modern-sidebar">
            <div class="sidebar-brand">
                <img src="/favicon.svg" alt="Venus" style="width: 32px; height: 32px; filter: brightness(0) invert(1);" />
                <span>Venus</span>
            </div>
            
            <nav class="sidebar-menu">
                <a href="#" class="menu-item active" data-tab="overview">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Overview</span>
                </a>
                <a href="#" class="menu-item" data-tab="projects">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Projects</span>
                </a>
                <a href="#" class="menu-item" data-tab="teams">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>Teams</span>
                </a>
            </nav>
            
            <button id="logout-btn" class="sidebar-logout">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Logout</span>
            </button>
        </aside>

        <!-- Main Content -->
        <main class="modern-main">
            <!-- Header -->
            <header class="modern-header">
                <div class="header-left">
                    <h1>Welcome back, ${username}</h1>
                    <p>Here's what's happening with your projects</p>
                </div>
                <div class="header-right">
                    <div id="credits-display" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 16px;
                        background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1));
                        border: 1px solid rgba(16, 185, 129, 0.3);
                        border-radius: 20px;
                        margin-right: 12px;
                    ">
                        <svg width="16" height="16" fill="none" stroke="#10B981" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span style="color: #10B981; font-weight: 600; font-size: 14px;" id="credits-value">--</span>
                        <span style="color: #888; font-size: 12px;">credits</span>
                    </div>
                    <button id="friends-btn" class="header-icon-btn" title="Friends">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </button>
                    <button id="notifications-btn" class="header-icon-btn" title="Notifications" style="position:relative;">
                        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <span id="notification-badge" style="display:none;position:absolute;top:4px;right:4px;background:#ffffff;border-radius:50%;width:8px;height:8px;"></span>
                    </button>
                    <div class="header-user">
                        <div class="user-avatar">${username.charAt(0).toUpperCase()}</div>
                        <span>${username}</span>
                    </div>
                </div>
            </header>

            <!-- Overview Tab -->
            <div id="tab-overview" class="tab-content">
                <!-- Stats Grid -->
                <div class="stats-container">
                    <div class="stat-glass-card">
                        <div class="stat-header">
                            <span class="stat-label">Total Projects</span>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div class="stat-value" id="total-projects-count">--</div>
                        <div class="stat-trend positive" id="projects-trend"></div>
                    </div>

                    <div class="stat-glass-card">
                        <div class="stat-header">
                            <span class="stat-label">Storage Used</span>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                        </div>
                        <div class="stat-value" id="storage-used-value">--</div>
                        <div class="stat-trend neutral" id="storage-used-trend">Calculating...</div>
                    </div>

                    <div class="stat-glass-card">
                        <div class="stat-header">
                            <span class="stat-label">Teams Involved</span>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <div class="stat-value" id="teams-count">--</div>
                        <div class="stat-trend positive"></div>
                    </div>
                </div>

                <!-- Recent Projects -->
                <div class="section-header-modern">
                    <h2>Recent Projects</h2>
                    <button id="new-project-overview" class="btn-modern-primary">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        New Project
                    </button>
                </div>
                <div class="projects-modern-grid" id="recent-projects-grid">
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                        <p style="color:#888;">Loading projects...</p>
                    </div>
                </div>
            </div>

            <!-- Projects Tab -->
            <div id="tab-projects" class="tab-content" style="display:none;">
                <div class="section-header-modern">
                    <h2>Collaborative Projects</h2>
                </div>
                <div class="projects-modern-grid" id="collaborative-projects-grid">
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                        <p style="color:#888;">Loading...</p>
                    </div>
                </div>

                <div class="section-header-modern" style="margin-top:32px;">
                    <h2>Starred Projects</h2>
                </div>
                <div class="projects-modern-grid" id="starred-projects-grid">
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                        <p style="color:#888;">No starred projects yet</p>
                    </div>
                </div>

                <div class="section-header-modern" style="margin-top:32px;">
                    <h2>My Projects</h2>
                    <button id="new-project" class="btn-modern-primary">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        New Project
                    </button>
                </div>
                <div class="projects-modern-grid" id="my-projects-grid">
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                        <p style="color:#888;">Loading...</p>
                    </div>
                </div>
            </div>

            <!-- Teams Tab -->
            <div id="tab-teams" class="tab-content" style="display:none;">
                <div class="section-header-modern">
                    <h2>My Teams</h2>
                    <button id="create-team-btn" class="btn-modern-primary">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Create Team
                    </button>
                </div>
                <div class="projects-modern-grid" id="teams-grid">
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                        <p style="color:#888;">Loading...</p>
                    </div>
                </div>
            </div>

        </main>
    `;

    container.appendChild(page);

    // Add Friends Dialog
    const friendsDialog = document.createElement("div");
    friendsDialog.id = "friends-dialog";
    friendsDialog.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    `;
    friendsDialog.innerHTML = `
        <div style="background: rgba(20, 20, 20, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 90%; max-width: 600px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 1.25rem; color: white;">Friends</h2>
                <button id="close-friends-dialog" style="background: transparent; border: none; color: #888; cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">×</button>
            </div>
            
            <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="display: flex; gap: 8px;">
                    <input type="email" id="friend-email-input" placeholder="Enter friend's email" style="flex: 1; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 14px;">
                    <button id="send-friend-request-btn" class="btn-modern-primary" style="padding: 10px 20px; white-space: nowrap;">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Add Friend
                    </button>
                </div>
            </div>

            <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
                <div style="margin-bottom: 1.5rem;">
                    <h3 style="margin: 0 0 12px 0; font-size: 0.875rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Friend Requests</h3>
                    <div id="friend-requests-list"></div>
                </div>

                <div>
                    <h3 style="margin: 0 0 12px 0; font-size: 0.875rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">My Friends</h3>
                    <div id="friends-list"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(friendsDialog);

    // Add Notifications Dialog
    const notificationsDialog = document.createElement("div");
    notificationsDialog.id = "notifications-dialog";
    notificationsDialog.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    `;
    notificationsDialog.innerHTML = `
        <div style="background: rgba(20, 20, 20, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 90%; max-width: 500px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 1.25rem; color: white;">Notifications</h2>
                <button id="close-notifications-dialog" style="background: transparent; border: none; color: #888; cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">×</button>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
                <div id="notifications-list"></div>
            </div>
        </div>
    `;
    container.appendChild(notificationsDialog);

    // Add Create Team Dialog
    const createTeamDialog = document.createElement("div");
    createTeamDialog.id = "create-team-dialog";
    createTeamDialog.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    `;
    createTeamDialog.innerHTML = `
        <div style="background: rgba(20, 20, 20, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 90%; max-width: 700px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0; font-size: 1.25rem; color: white;">Create Team</h2>
                <button id="close-create-team-dialog" style="background: transparent; border: none; color: #888; cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">×</button>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
                <!-- Team Name -->
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; color: #888; font-size: 13px; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Team Name *</label>
                    <input type="text" id="team-name-input" placeholder="Enter team name" style="width: 100%; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 14px;">
                </div>

                <!-- Team Description -->
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; color: #888; font-size: 13px; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Description</label>
                    <textarea id="team-description-input" placeholder="Enter team description (optional)" style="width: 100%; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 14px; min-height: 80px; resize: vertical; font-family: inherit;"></textarea>
                </div>

                <!-- Add Friends as Members -->
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; color: #888; font-size: 13px; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Add Friends</label>
                    <div id="friends-selection-list" style="max-height: 150px; overflow-y: auto; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 8px;">
                        <div style="text-align: center; color: #666; padding: 20px; font-size: 13px;">Loading friends...</div>
                    </div>
                </div>

                <!-- Invite by Email -->
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; color: #888; font-size: 13px; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Invite Collaborators by Email</label>
                    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <input type="email" id="team-invite-email-input" placeholder="Enter email address" style="flex: 1; padding: 8px 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 13px;">
                        <button id="add-team-invite-btn" style="padding: 8px 16px; background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; white-space: nowrap;">Add</button>
                    </div>
                    <div id="team-invites-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
                </div>

                <!-- Project Options -->
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; color: #888; font-size: 13px; font-weight: 500; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Project</label>
                    <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; font-size: 14px;">
                            <input type="radio" name="project-option" value="new" checked style="cursor: pointer;">
                            <span>Create New Project</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; font-size: 14px;">
                            <input type="radio" name="project-option" value="existing" style="cursor: pointer;">
                            <span>Add Existing Project</span>
                        </label>
                    </div>

                    <!-- New Project Input -->
                    <div id="new-project-section">
                        <input type="text" id="team-project-name-input" placeholder="Enter project name" style="width: 100%; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 14px;">
                    </div>

                    <!-- Existing Project Selection -->
                    <div id="existing-project-section" style="display: none;">
                        <select id="team-existing-project-select" style="width: 100%; padding: 10px 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 14px; cursor: pointer;">
                            <option value="" style="background: #1a1a1a; color: white;">Select a project...</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: flex-end; gap: 12px;">
                <button id="cancel-create-team-btn" style="padding: 10px 20px; background: rgba(255, 255, 255, 0.05); color: white; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
                <button id="submit-create-team-btn" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Create Team</button>
            </div>
        </div>
    `;
    container.appendChild(createTeamDialog);

    // Add Team Management Dialog
    const teamManagementDialog = document.createElement("div");
    teamManagementDialog.id = "team-management-dialog";
    teamManagementDialog.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    `;
    teamManagementDialog.innerHTML = `
        <div style="background: rgba(20, 20, 20, 0.95); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 90%; max-width: 1200px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
                <h2 id="team-management-title" style="margin: 0; font-size: 1.25rem; color: white;">Team Management</h2>
                <button id="close-team-management-dialog" style="background: transparent; border: none; color: #888; cursor: pointer; font-size: 24px; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">×</button>
            </div>
            
            <div style="flex: 1; overflow: hidden; display: flex;">
                <!-- Left Panel: Members -->
                <div style="flex: 1; border-right: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column;">
                    <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                        <h3 style="margin: 0 0 12px 0; font-size: 1rem; color: white;">Team Members</h3>
                        <div style="display: flex; gap: 8px;">
                            <input type="email" id="add-member-email-input" placeholder="Enter email to invite" style="flex: 1; padding: 8px 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: white; font-size: 13px;">
                            <button id="add-member-btn" style="padding: 8px 16px; background: #2d2d2d; color: white; border: 1px solid #404040; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; white-space: nowrap;">Add</button>
                        </div>
                    </div>
                    <div id="team-members-list" style="flex: 1; overflow-y: auto; padding: 1rem;"></div>
                </div>
                
                <!-- Right Panel: Projects -->
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 1rem; color: white;">Team Projects</h3>
                            <button id="add-project-to-team-btn" style="padding: 6px 12px; background: #2d2d2d; color: white; border: 1px solid #404040; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Add Project
                            </button>
                        </div>
                    </div>
                    <div id="team-projects-list" style="flex: 1; overflow-y: auto; padding: 1rem;"></div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(teamManagementDialog);

    // Team Management Dialog handlers
    document.getElementById("close-team-management-dialog")?.addEventListener("click", () => {
        const dialog = document.getElementById("team-management-dialog");
        if (dialog) dialog.style.display = "none";
    });

    document.getElementById("team-management-dialog")?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("team-management-dialog")) {
            const dialog = document.getElementById("team-management-dialog");
            if (dialog) dialog.style.display = "none";
        }
    });

    // ─── Event handlers ─────────────────────────────────────────────────

    // Tab switching
    document.querySelectorAll(".menu-item").forEach((item) => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tab = (item as HTMLElement).getAttribute("data-tab");
            if (!tab) return;

            // Update active menu item
            document.querySelectorAll(".menu-item").forEach((i) => i.classList.remove("active"));
            item.classList.add("active");

            // Show corresponding tab content
            document.querySelectorAll(".tab-content").forEach((t) => {
                (t as HTMLElement).style.display = "none";
            });
            const tabContent = document.getElementById(`tab-${tab}`);
            if (tabContent) {
                tabContent.style.display = "block";
            }

            // Load data for the tab
            switch (tab) {
                case "overview":
                    loadOverview(router);
                    break;
                case "projects":
                    loadProjectsTab(router);
                    break;
                case "teams":
                    loadTeams(router);
                    break;
            }
        });
    });

    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        try {
            await authService.signOutUser();
            router.navigate("/");
        } catch (error) {
            console.error("Logout failed:", error);
            alert("Failed to logout. Please try again.");
        }
    });

    document.getElementById("new-project")?.addEventListener("click", async () => {
        await createNewProject(router);
    });

    document.getElementById("new-project-overview")?.addEventListener("click", async () => {
        await createNewProject(router);
    });

    // Create Team Dialog handlers (set up once)
    let createTeamHandlersAttached = false;

    function attachCreateTeamDialogHandlers(router: IRouter) {
        if (createTeamHandlersAttached) return;
        createTeamHandlersAttached = true;

        document.getElementById("close-create-team-dialog")?.addEventListener("click", () => {
            const dialog = document.getElementById("create-team-dialog");
            if (dialog) dialog.style.display = "none";
        });

        document.getElementById("cancel-create-team-btn")?.addEventListener("click", () => {
            const dialog = document.getElementById("create-team-dialog");
            if (dialog) dialog.style.display = "none";
        });

        document.getElementById("create-team-dialog")?.addEventListener("click", (e) => {
            if (e.target === document.getElementById("create-team-dialog")) {
                const dialog = document.getElementById("create-team-dialog");
                if (dialog) dialog.style.display = "none";
            }
        });

        // Project option radio buttons
        document.querySelectorAll('input[name="project-option"]').forEach((radio) => {
            radio.addEventListener("change", (e) => {
                const value = (e.target as HTMLInputElement).value;
                const newSection = document.getElementById("new-project-section");
                const existingSection = document.getElementById("existing-project-section");

                if (value === "new") {
                    if (newSection) newSection.style.display = "block";
                    if (existingSection) existingSection.style.display = "none";
                } else {
                    if (newSection) newSection.style.display = "none";
                    if (existingSection) existingSection.style.display = "block";
                }
            });
        });

        // Add invite email
        document.getElementById("add-team-invite-btn")?.addEventListener("click", () => {
            const input = document.getElementById("team-invite-email-input") as HTMLInputElement;
            const email = input?.value.trim();
            if (!email) return;

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                alert("Please enter a valid email address");
                return;
            }

            addInviteEmailTag(email);
            input.value = "";
        });

        // Submit create team
        document.getElementById("submit-create-team-btn")?.addEventListener("click", async () => {
            await handleCreateTeam(router);
        });
    }

    // Attach dialog handlers immediately
    attachCreateTeamDialogHandlers(router);

    // Create Team button handler (using event delegation since button is in Teams tab)
    document.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.id === "create-team-btn" || target.closest("#create-team-btn")) {
            const dialog = document.getElementById("create-team-dialog");
            if (dialog) {
                dialog.style.display = "flex";
                loadCreateTeamDialog(router);
            }
        }
    });

    // Friends dialog handlers
    document.getElementById("friends-btn")?.addEventListener("click", () => {
        const dialog = document.getElementById("friends-dialog");
        if (dialog) {
            dialog.style.display = "flex";
            loadFriendsDialog();
        }
    });

    document.getElementById("close-friends-dialog")?.addEventListener("click", () => {
        const dialog = document.getElementById("friends-dialog");
        if (dialog) dialog.style.display = "none";
    });

    document.getElementById("friends-dialog")?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("friends-dialog")) {
            const dialog = document.getElementById("friends-dialog");
            if (dialog) dialog.style.display = "none";
        }
    });

    document.getElementById("send-friend-request-btn")?.addEventListener("click", async () => {
        const input = document.getElementById("friend-email-input") as HTMLInputElement;
        const email = input?.value.trim();
        if (!email) {
            alert("Please enter an email address");
            return;
        }

        try {
            const { friendService } = await import("chili-core");
            await friendService.sendFriendRequest(email);
            alert("Friend request sent!");
            input.value = "";
            loadFriendsDialog();
        } catch (error: any) {
            console.error("Failed to send friend request:", error);
            alert(error.message || "Failed to send friend request");
        }
    });

    // Notifications dialog handlers
    document.getElementById("notifications-btn")?.addEventListener("click", () => {
        const dialog = document.getElementById("notifications-dialog");
        if (dialog) {
            dialog.style.display = "flex";
            loadNotificationsDialog();
            updateNotificationBadge();
        }
    });

    document.getElementById("close-notifications-dialog")?.addEventListener("click", () => {
        const dialog = document.getElementById("notifications-dialog");
        if (dialog) dialog.style.display = "none";
    });

    document.getElementById("notifications-dialog")?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("notifications-dialog")) {
            const dialog = document.getElementById("notifications-dialog");
            if (dialog) dialog.style.display = "none";
        }
    });

    // Load notification count on page load
    updateNotificationBadge();

    // ─── Load initial data ──────────────────────────────────────────────
    loadOverview(router);
    loadCredits();
}

// ─── Load Credits Function ──────────────────────────────────────────────

async function loadCredits(): Promise<void> {
    try {
        const { creditsService } = await import("chili-core");
        const user = auth.currentUser;

        if (!user) {
            console.error("No user logged in");
            return;
        }

        const credits = await creditsService.getCredits(user.uid);
        const creditsValueEl = document.getElementById("credits-value");

        if (creditsValueEl) {
            creditsValueEl.textContent = credits.toString();
        }
    } catch (error) {
        console.error("Error loading credits:", error);
        const creditsValueEl = document.getElementById("credits-value");
        if (creditsValueEl) {
            creditsValueEl.textContent = "0";
        }
    }
}

// ─── Friends Dialog Functions ───────────────────────────────────────────

async function loadFriendsDialog(): Promise<void> {
    try {
        const { friendService } = await import("chili-core");
        const [requests, friends] = await Promise.all([
            friendService.getFriendRequests(),
            friendService.getFriends(),
        ]);

        // Load friend requests
        const requestsList = document.getElementById("friend-requests-list");
        if (requestsList) {
            if (requests.length === 0) {
                requestsList.innerHTML = `
                    <div style="text-align: center; color: #666; padding: 20px; font-size: 14px;">
                        No pending friend requests
                    </div>
                `;
            } else {
                requestsList.innerHTML = "";
                for (const request of requests) {
                    const requestCard = document.createElement("div");
                    requestCard.style.cssText = `
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;
                    requestCard.innerHTML = `
                        <div>
                            <div style="color: white; font-weight: 500; margin-bottom: 4px;">${escapeHtml(request.fromName)}</div>
                            <div style="color: #888; font-size: 12px;">${escapeHtml(request.fromEmail)}</div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="accept-friend-btn" data-request-id="${request.id}" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Accept</button>
                            <button class="reject-friend-btn" data-request-id="${request.id}" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Reject</button>
                        </div>
                    `;
                    requestsList.appendChild(requestCard);
                }

                // Add event listeners for accept/reject
                requestsList.querySelectorAll(".accept-friend-btn").forEach((btn) => {
                    btn.addEventListener("click", async (e) => {
                        const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                        if (!requestId) return;
                        try {
                            await friendService.acceptFriendRequest(requestId);
                            loadFriendsDialog();
                        } catch (error) {
                            console.error("Failed to accept friend request:", error);
                            alert("Failed to accept friend request");
                        }
                    });
                });

                requestsList.querySelectorAll(".reject-friend-btn").forEach((btn) => {
                    btn.addEventListener("click", async (e) => {
                        const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                        if (!requestId) return;
                        try {
                            await friendService.rejectFriendRequest(requestId);
                            loadFriendsDialog();
                        } catch (error) {
                            console.error("Failed to reject friend request:", error);
                            alert("Failed to reject friend request");
                        }
                    });
                });
            }
        }

        // Load friends list
        const friendsList = document.getElementById("friends-list");
        if (friendsList) {
            if (friends.length === 0) {
                friendsList.innerHTML = `
                    <div style="text-align: center; color: #666; padding: 20px; font-size: 14px;">
                        No friends yet. Add friends to collaborate!
                    </div>
                `;
            } else {
                friendsList.innerHTML = "";
                for (const friend of friends) {
                    const friendCard = document.createElement("div");
                    friendCard.style.cssText = `
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;
                    friendCard.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px;">
                                ${friend.friendName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="color: white; font-weight: 500; margin-bottom: 2px;">${escapeHtml(friend.friendName)}</div>
                                <div style="color: #888; font-size: 12px;">${escapeHtml(friend.friendEmail)}</div>
                            </div>
                        </div>
                        <button class="remove-friend-btn" data-friend-id="${friend.friendId}" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Remove</button>
                    `;
                    friendsList.appendChild(friendCard);
                }

                // Add event listeners for remove
                friendsList.querySelectorAll(".remove-friend-btn").forEach((btn) => {
                    btn.addEventListener("click", async (e) => {
                        const friendId = (e.target as HTMLElement).getAttribute("data-friend-id");
                        if (!friendId) return;
                        if (!confirm("Remove this friend?")) return;
                        try {
                            await friendService.removeFriend(friendId);
                            loadFriendsDialog();
                        } catch (error) {
                            console.error("Failed to remove friend:", error);
                            alert("Failed to remove friend");
                        }
                    });
                });
            }
        }
    } catch (error) {
        console.error("Failed to load friends:", error);
    }
}

// ─── Notifications Dialog Functions ─────────────────────────────────────

async function updateNotificationBadge(): Promise<void> {
    try {
        const { friendService, accessRequestService, auth, shareService } = await import("chili-core");
        const user = auth.currentUser;
        if (!user) return;

        const friendRequests = await friendService.getFriendRequests();
        const accessRequests = await accessRequestService.getMyRequests();
        const projectInvitations = await shareService.getProjectInvitations();

        // Get team invitations count
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        const { db } = await import("chili-core");
        const teamInvitationsRef = collection(db, "teamInvitations");
        const teamInvitationsQuery = query(
            teamInvitationsRef,
            where("invitedEmail", "==", user.email),
            where("status", "==", "pending"),
        );
        const teamInvitationsSnap = await getDocs(teamInvitationsQuery);

        const totalNotifications =
            friendRequests.length +
            accessRequests.length +
            teamInvitationsSnap.size +
            projectInvitations.length;

        const badge = document.getElementById("notification-badge");
        if (badge) {
            if (totalNotifications > 0) {
                badge.style.display = "block";
            } else {
                badge.style.display = "none";
            }
        }
    } catch (error) {
        console.error("Failed to update notification badge:", error);
    }
}

async function loadNotificationsDialog(): Promise<void> {
    try {
        const { friendService, accessRequestService, auth } = await import("chili-core");
        const user = auth.currentUser;
        if (!user) return;

        const friendRequests = await friendService.getFriendRequests();
        const accessRequests = await accessRequestService.getMyRequests();

        // Get team invitations
        const { collection, query, where, getDocs } = await import("firebase/firestore");
        const { db, shareService } = await import("chili-core");
        const teamInvitationsRef = collection(db, "teamInvitations");
        const teamInvitationsQuery = query(
            teamInvitationsRef,
            where("invitedEmail", "==", user.email),
            where("status", "==", "pending"),
        );
        const teamInvitationsSnap = await getDocs(teamInvitationsQuery);
        const teamInvitations = teamInvitationsSnap.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                teamId: data.teamId as string,
                teamName: data.teamName as string,
                invitedByEmail: data.invitedByEmail as string,
                invitedEmail: data.invitedEmail as string,
                status: data.status as string,
            };
        });

        // Get project invitations
        const allProjectInvitations = await shareService.getProjectInvitations();

        // Remove duplicate project invitations (keep most recent per project)
        const uniqueInvitationsMap = new Map<string, any>();
        for (const inv of allProjectInvitations) {
            const existing = uniqueInvitationsMap.get(inv.projectId);
            const invTime = inv.createdAt?.toMillis?.() || 0;
            const existingTime = existing?.createdAt?.toMillis?.() || 0;

            if (!existing || invTime > existingTime) {
                uniqueInvitationsMap.set(inv.projectId, inv);
            }
        }
        const projectInvitations = Array.from(uniqueInvitationsMap.values());

        const notificationsList = document.getElementById("notifications-list");
        if (!notificationsList) return;

        const totalNotifications =
            friendRequests.length +
            accessRequests.length +
            teamInvitations.length +
            projectInvitations.length;

        if (totalNotifications === 0) {
            notificationsList.innerHTML = `
                <div style="text-align: center; color: #666; padding: 40px; font-size: 14px;">
                    <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin: 0 auto 12px;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p>No new notifications</p>
                </div>
            `;
        } else {
            notificationsList.innerHTML = "";

            // Add Team Invitations
            for (const invitation of teamInvitations) {
                const notificationCard = document.createElement("div");
                notificationCard.style.cssText = `
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 12px;
                `;
                notificationCard.innerHTML = `
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #22c55e 0%, #10b981 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                            T
                        </div>
                        <div style="flex: 1;">
                            <div style="color: white; font-weight: 600; margin-bottom: 4px;">Team Invitation</div>
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-bottom: 8px;">
                                You've been invited to join the team <strong>${escapeHtml(invitation.teamName)}</strong>
                            </div>
                            <div style="color: #888; font-size: 12px; margin-bottom: 12px;">
                                Invited by ${escapeHtml(invitation.invitedByEmail)}
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="accept-team-invite-btn" data-invitation-id="${invitation.id}" data-team-id="${invitation.teamId}" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Accept</button>
                                <button class="reject-team-invite-btn" data-invitation-id="${invitation.id}" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Decline</button>
                            </div>
                        </div>
                    </div>
                `;
                notificationsList.appendChild(notificationCard);
            }

            // Add Access Requests
            for (const request of accessRequests) {
                const roleLabel = request.requestedRole === "viewer" ? "Viewer" : "Editor";
                const roleColor = request.requestedRole === "viewer" ? "#3b82f6" : "#10b981";

                const notificationCard = document.createElement("div");
                notificationCard.style.cssText = `
                    background: rgba(168, 85, 247, 0.1);
                    border: 1px solid rgba(168, 85, 247, 0.2);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 12px;
                `;
                notificationCard.innerHTML = `
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                            ${request.requesterName.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex: 1;">
                            <div style="color: white; font-weight: 600; margin-bottom: 4px;">Project Access Request</div>
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-bottom: 8px;">
                                <strong>${escapeHtml(request.requesterName)}</strong> (${escapeHtml(request.requesterEmail)}) wants <span style="color: ${roleColor}; font-weight: 600;">${roleLabel}</span> access to your project
                            </div>
                            ${request.message ? `<div style="color: #888; font-size: 13px; margin-bottom: 8px; font-style: italic;">"${escapeHtml(request.message)}"</div>` : ""}
                            <div style="color: #888; font-size: 12px; margin-bottom: 12px;">
                                ${formatTimeAgo(request.requestedAt)}
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="approve-access-btn" data-request-id="${request.id}" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Approve as ${roleLabel}</button>
                                <button class="reject-access-btn" data-request-id="${request.id}" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Reject</button>
                            </div>
                        </div>
                    </div>
                `;
                notificationsList.appendChild(notificationCard);
            }

            // Add Project Invitations
            for (const invitation of projectInvitations) {
                const notificationCard = document.createElement("div");
                notificationCard.style.cssText = `
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 12px;
                `;
                notificationCard.innerHTML = `
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                            P
                        </div>
                        <div style="flex: 1;">
                            <div style="color: white; font-weight: 600; margin-bottom: 4px;">Project Invitation</div>
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-bottom: 8px;">
                                You've been invited to collaborate on <strong>${escapeHtml(invitation.projectName)}</strong>
                            </div>
                            <div style="color: #888; font-size: 12px; margin-bottom: 12px;">
                                Invited by ${escapeHtml(invitation.ownerEmail)}
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="accept-project-invite-btn" data-invitation-id="${invitation.id}" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Accept</button>
                                <button class="reject-project-invite-btn" data-invitation-id="${invitation.id}" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Decline</button>
                            </div>
                        </div>
                    </div>
                `;
                notificationsList.appendChild(notificationCard);
            }

            // Add Friend Requests
            for (const request of friendRequests) {
                const notificationCard = document.createElement("div");
                notificationCard.style.cssText = `
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 12px;
                `;
                notificationCard.innerHTML = `
                    <div style="display: flex; align-items: start; gap: 12px;">
                        <div style="width: 40px; height="40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px; flex-shrink: 0;">
                            ${request.fromName.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex: 1;">
                            <div style="color: white; font-weight: 600; margin-bottom: 4px;">Friend Request</div>
                            <div style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin-bottom: 8px;">
                                <strong>${escapeHtml(request.fromName)}</strong> (${escapeHtml(request.fromEmail)}) wants to be your friend
                            </div>
                            <div style="color: #888; font-size: 12px; margin-bottom: 12px;">
                                ${formatTimeAgo(request.createdAt)}
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="accept-notification-btn" data-request-id="${request.id}" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Accept</button>
                                <button class="reject-notification-btn" data-request-id="${request.id}" style="padding: 8px 16px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Decline</button>
                            </div>
                        </div>
                    </div>
                `;
                notificationsList.appendChild(notificationCard);
            }

            // Add event listeners for access requests
            notificationsList.querySelectorAll(".approve-access-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                    if (!requestId) return;
                    try {
                        await accessRequestService.approveRequest(requestId);
                        loadNotificationsDialog();
                        updateNotificationBadge();

                        await showCustomAlert("Access request approved!", "success");
                    } catch (error) {
                        console.error("Failed to approve access request:", error);
                        await showCustomAlert("Failed to approve access request", "error");
                    }
                });
            });

            notificationsList.querySelectorAll(".reject-access-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                    if (!requestId) return;
                    try {
                        await accessRequestService.rejectRequest(requestId);
                        loadNotificationsDialog();
                        updateNotificationBadge();
                    } catch (error) {
                        console.error("Failed to reject access request:", error);
                        await showCustomAlert("Failed to reject access request", "error");
                    }
                });
            });

            // Add event listeners for friend requests
            notificationsList.querySelectorAll(".accept-notification-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                    if (!requestId) return;
                    try {
                        await friendService.acceptFriendRequest(requestId);
                        loadNotificationsDialog();
                        updateNotificationBadge();

                        await showCustomAlert("Friend request accepted!", "success");
                    } catch (error) {
                        console.error("Failed to accept friend request:", error);
                        alert("Failed to accept friend request");
                    }
                });
            });

            notificationsList.querySelectorAll(".reject-notification-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const requestId = (e.target as HTMLElement).getAttribute("data-request-id");
                    if (!requestId) return;
                    try {
                        await friendService.rejectFriendRequest(requestId);
                        loadNotificationsDialog();
                        updateNotificationBadge();
                    } catch (error) {
                        console.error("Failed to reject friend request:", error);
                        alert("Failed to reject friend request");
                    }
                });
            });

            // Add event listeners for team invitations
            notificationsList.querySelectorAll(".accept-team-invite-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const invitationId = (e.target as HTMLElement).getAttribute("data-invitation-id");
                    const teamId = (e.target as HTMLElement).getAttribute("data-team-id");
                    if (!invitationId || !teamId) return;
                    try {
                        const { doc, updateDoc, setDoc, serverTimestamp } = await import(
                            "firebase/firestore"
                        );
                        const { db, auth } = await import("chili-core");
                        const user = auth.currentUser;
                        if (!user) return;

                        // Add user to team members subcollection
                        const memberData = {
                            uid: user.uid,
                            email: user.email!,
                            displayName: user.displayName || user.email!.split("@")[0],
                            role: "editor",
                            joinedAt: serverTimestamp(),
                        };
                        await setDoc(doc(db, "teams", teamId, "members", user.uid), memberData);

                        // Update invitation status
                        await updateDoc(doc(db, "teamInvitations", invitationId), {
                            status: "accepted",
                        });

                        loadNotificationsDialog();
                        updateNotificationBadge();

                        await showCustomAlert("Team invitation accepted!", "success");
                    } catch (error) {
                        console.error("Failed to accept team invitation:", error);
                        await showCustomAlert("Failed to accept team invitation", "error");
                    }
                });
            });

            notificationsList.querySelectorAll(".reject-team-invite-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const invitationId = (e.target as HTMLElement).getAttribute("data-invitation-id");
                    if (!invitationId) return;
                    try {
                        const { doc, updateDoc } = await import("firebase/firestore");
                        const { db } = await import("chili-core");

                        // Update invitation status
                        await updateDoc(doc(db, "teamInvitations", invitationId), {
                            status: "rejected",
                        });

                        loadNotificationsDialog();
                        updateNotificationBadge();
                    } catch (error) {
                        console.error("Failed to reject team invitation:", error);
                        await showCustomAlert("Failed to reject team invitation", "error");
                    }
                });
            });

            // Add event listeners for project invitations
            notificationsList.querySelectorAll(".accept-project-invite-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const invitationId = (e.target as HTMLElement).getAttribute("data-invitation-id");
                    if (!invitationId) return;
                    try {
                        const { shareService } = await import("chili-core");
                        await shareService.acceptProjectInvitation(invitationId);
                        loadNotificationsDialog();
                        updateNotificationBadge();

                        await showCustomAlert(
                            "Project invitation accepted! The project is now in your Collaborative Projects.",
                            "success",
                        );
                    } catch (error) {
                        console.error("Failed to accept project invitation:", error);
                        await showCustomAlert("Failed to accept project invitation", "error");
                    }
                });
            });

            notificationsList.querySelectorAll(".reject-project-invite-btn").forEach((btn) => {
                btn.addEventListener("click", async (e) => {
                    const invitationId = (e.target as HTMLElement).getAttribute("data-invitation-id");
                    if (!invitationId) return;
                    try {
                        const { shareService } = await import("chili-core");
                        await shareService.rejectProjectInvitation(invitationId);
                        loadNotificationsDialog();
                        updateNotificationBadge();
                    } catch (error) {
                        console.error("Failed to reject project invitation:", error);
                        await showCustomAlert("Failed to reject project invitation", "error");
                    }
                });
            });
        }
    } catch (error) {
        console.error("Failed to load notifications:", error);
    }
}

// ─── Helper Functions ───────────────────────────────────────────────────

function formatTimeAgo(date: Date | any): string {
    // Handle Firestore Timestamp objects
    let dateObj: Date;
    if (date && typeof date.toDate === "function") {
        dateObj = date.toDate();
    } else if (date instanceof Date) {
        dateObj = date;
    } else if (date && typeof date.getTime === "function") {
        dateObj = date;
    } else {
        // Fallback for invalid dates
        return "Recently";
    }

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return dateObj.toLocaleDateString();
}

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

async function showProjectHistoryDialog(project: any, router: IRouter): Promise<void> {
    // Create dialog overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
        background: rgba(20, 20, 20, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    dialog.innerHTML = `
        <div style="padding: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h2 style="margin: 0 0 8px 0; font-size: 1.5rem; color: white; display: flex; align-items: center; gap: 12px;">
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Edit History
                </h2>
                <p style="margin: 0; color: #888; font-size: 0.875rem;">${escapeHtml(project.projectName)}</p>
            </div>
            <button id="close-history-dialog" style="background: transparent; border: none; color: #888; cursor: pointer; font-size: 28px; padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.2s;">×</button>
        </div>
        
        <div id="history-content" style="flex: 1; overflow-y: auto; padding: 24px;">
            <div style="text-align: center; color: #888; padding: 40px;">
                <div class="loading-spinner" style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                Loading history...
            </div>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close button
    const closeBtn = dialog.querySelector("#close-history-dialog");
    closeBtn?.addEventListener("click", () => {
        overlay.remove();
    });

    closeBtn?.addEventListener("mouseenter", () => {
        (closeBtn as HTMLElement).style.background = "rgba(255, 255, 255, 0.1)";
        (closeBtn as HTMLElement).style.color = "white";
    });

    closeBtn?.addEventListener("mouseleave", () => {
        (closeBtn as HTMLElement).style.background = "transparent";
        (closeBtn as HTMLElement).style.color = "#888";
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    // Load history
    try {
        const { projectHistoryService } = await import("chili-core");
        let history = [];

        console.log("=== HISTORY DEBUG ===");
        console.log("Project data:", project);
        console.log("Project sessionId:", project.sessionId);
        console.log("Project userId:", project.userId);
        console.log("Project projectName:", project.projectName);
        console.log("=====================");

        try {
            console.log("Attempting to load history from Firestore...");
            console.log("Path: users/" + project.userId + "/projects/" + project.sessionId + "/history");
            history = await projectHistoryService.getHistory(project.sessionId, project.userId);
            console.log("✓ History loaded successfully:", history.length, "entries");
            if (history.length > 0) {
                console.log("First history entry:", history[0]);
            }
        } catch (historyError: any) {
            // If the error is about missing collection/permissions, treat as empty history
            console.error("✗ Failed to load history:", historyError);
            console.error("Error code:", historyError.code);
            console.error("Error message:", historyError.message);
            history = [];
        }

        const contentDiv = dialog.querySelector("#history-content");
        if (!contentDiv) return;

        if (history.length === 0) {
            contentDiv.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <svg width="64" height="64" fill="none" stroke="#888" viewBox="0 0 24 24" style="margin: 0 auto 20px; opacity: 0.5;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 style="color: #888; font-size: 1.125rem; margin: 0 0 12px 0; font-weight: 500;">No edit history yet</h3>
                    <p style="color: #666; font-size: 0.875rem; line-height: 1.6; max-width: 400px; margin: 0 auto;">
                        History will appear when you or collaborators save changes to this project. Each save creates a snapshot showing who made the change, when, and what was modified.
                    </p>
                </div>
            `;
            return;
        }

        // Render history timeline
        contentDiv.innerHTML = `
            <div style="position: relative;">
                <div style="position: absolute; left: 20px; top: 0; bottom: 0; width: 2px; background: linear-gradient(to bottom, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));"></div>
                <div id="history-timeline"></div>
            </div>
        `;

        const timeline = contentDiv.querySelector("#history-timeline");
        if (!timeline) return;

        const actionIcons: Record<string, string> = {
            created: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />`,
            modified: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />`,
            renamed: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />`,
            shared: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />`,
            deleted: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />`,
        };

        const actionColors: Record<string, string> = {
            created: "#4ade80",
            modified: "#3b82f6",
            renamed: "#f59e0b",
            shared: "#8b5cf6",
            deleted: "#ef4444",
        };

        for (const change of history) {
            const actionColor = actionColors[change.action] || "#888";
            const actionIcon = actionIcons[change.action] || actionIcons.modified;
            const timestamp = new Date(change.timestamp);
            const timeAgo = formatTimeAgo(timestamp);
            const fullDate = timestamp.toLocaleString();

            const changeItem = document.createElement("div");
            changeItem.style.cssText = `
                position: relative;
                padding-left: 56px;
                padding-bottom: 32px;
            `;

            const hasFileUrl = change.fileUrl && change.fileUrl.trim() !== "";

            changeItem.innerHTML = `
                <div style="position: absolute; left: 8px; top: 0; width: 24px; height: 24px; background: ${actionColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px rgba(20, 20, 20, 0.98), 0 0 0 6px ${actionColor}33;">
                    <svg width="14" height="14" fill="none" stroke="white" viewBox="0 0 24 24">
                        ${actionIcon}
                    </svg>
                </div>
                
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
                                    ${change.userName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style="color: white; font-size: 14px; font-weight: 600;">${escapeHtml(change.userName)}</div>
                                    <div style="color: #888; font-size: 12px;">${escapeHtml(change.userEmail)}</div>
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="color: ${actionColor}; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${actionColor}22; padding: 4px 10px; border-radius: 6px; margin-bottom: 6px;">${change.action}</div>
                            <div style="color: #666; font-size: 11px;" title="${fullDate}">${timeAgo}</div>
                        </div>
                    </div>
                    
                    <div style="color: #ccc; font-size: 13px; line-height: 1.5; margin-bottom: ${hasFileUrl ? "12px" : "0"};">
                        ${escapeHtml(change.description)}
                    </div>
                    
                    ${
                        hasFileUrl
                            ? `
                        <button class="download-version-btn" data-file-url="${escapeHtml(change.fileUrl || "")}" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download this version
                        </button>
                    `
                            : ""
                    }
                </div>
            `;

            timeline.appendChild(changeItem);

            // Download button handler
            if (hasFileUrl) {
                const downloadBtn = changeItem.querySelector(".download-version-btn");
                downloadBtn?.addEventListener("click", () => {
                    const fileUrl = downloadBtn.getAttribute("data-file-url");
                    if (fileUrl) {
                        window.open(fileUrl, "_blank");
                    }
                });

                downloadBtn?.addEventListener("mouseenter", () => {
                    (downloadBtn as HTMLElement).style.background = "rgba(59, 130, 246, 0.25)";
                    (downloadBtn as HTMLElement).style.borderColor = "rgba(59, 130, 246, 0.5)";
                    (downloadBtn as HTMLElement).style.transform = "translateY(-2px)";
                });

                downloadBtn?.addEventListener("mouseleave", () => {
                    (downloadBtn as HTMLElement).style.background = "rgba(59, 130, 246, 0.15)";
                    (downloadBtn as HTMLElement).style.borderColor = "rgba(59, 130, 246, 0.3)";
                    (downloadBtn as HTMLElement).style.transform = "translateY(0)";
                });
            }
        }
    } catch (error) {
        console.error("Failed to load history:", error);
        const contentDiv = dialog.querySelector("#history-content");
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <svg width="64" height="64" fill="none" stroke="#ef4444" viewBox="0 0 24 24" style="margin: 0 auto 20px; opacity: 0.5;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 style="color: #ef4444; font-size: 1.125rem; margin: 0 0 12px 0; font-weight: 500;">Failed to load history</h3>
                    <p style="color: #888; font-size: 0.875rem;">Please try again later.</p>
                </div>
            `;
        }
    }
}

async function createNewProject(router: IRouter): Promise<void> {
    try {
        const projectName = await showCustomPrompt("Enter project name:", `Project-${Date.now()}`);
        if (!projectName) return;

        const project = await projectService.createProject(projectName);
        localStorage.setItem("currentSessionId", project.sessionId);
        localStorage.setItem("currentProjectName", project.projectName);
        localStorage.setItem("currentProjectOwnerId", project.userId);
        localStorage.setItem("currentUserPermission", "owner"); // Creator is owner
        router.navigate(`/editor?sessionId=${project.sessionId}`);
    } catch (error) {
        console.error("Failed to create project:", error);
        await showCustomAlert("Failed to create project. Please try again.", "error");
    }
}

// ─── Overview Tab ───────────────────────────────────────────────────────

async function calculateStorageUsage(projects: any[]): Promise<void> {
    const storageValueEl = document.getElementById("storage-used-value");
    const storageTrendEl = document.getElementById("storage-used-trend");

    if (!storageValueEl || !storageTrendEl) return;

    try {
        let totalBytes = 0;
        let filesProcessed = 0;

        // Fetch file sizes from Cloudinary URLs
        for (const project of projects) {
            if (project.fileUrl) {
                try {
                    const response = await fetch(project.fileUrl, { method: "HEAD" });
                    const contentLength = response.headers.get("content-length");
                    if (contentLength) {
                        totalBytes += parseInt(contentLength, 10);
                        filesProcessed++;
                    }
                } catch (error) {
                    console.warn(`Failed to fetch size for project ${project.projectName}:`, error);
                }
            }
        }

        // Format bytes to human-readable format
        const formatBytes = (bytes: number): string => {
            if (bytes === 0) return "0 B";
            const k = 1024;
            const sizes = ["B", "KB", "MB", "GB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
        };

        storageValueEl.textContent = formatBytes(totalBytes);
        storageTrendEl.textContent = `${filesProcessed} of ${projects.length} projects`;
        storageTrendEl.className = "stat-trend neutral";
    } catch (error) {
        console.error("Failed to calculate storage:", error);
        storageValueEl.textContent = "Error";
        storageTrendEl.textContent = "Unable to calculate";
        storageTrendEl.className = "stat-trend neutral";
    }
}

async function loadOverview(router: IRouter): Promise<void> {
    try {
        const projects = await projectService.getProjects();
        const { shareService, teamService } = await import("chili-core");
        const sharedProjects = await shareService.getSharedProjects();
        const teams = await teamService.getMyTeams();

        // Update stats
        const totalCount = document.getElementById("total-projects-count");
        const teamsCount = document.getElementById("teams-count");
        if (totalCount) totalCount.textContent = String(projects.length + sharedProjects.length);
        if (teamsCount) teamsCount.textContent = String(teams.length);

        // Calculate storage usage
        calculateStorageUsage(projects);

        // Load recent projects (last 6)
        const recentProjects = projects.slice(0, 6);
        const grid = document.getElementById("recent-projects-grid");
        if (!grid) return;

        if (recentProjects.length === 0) {
            grid.innerHTML = `
                <div class="project-glass-card" id="create-first-project-card" style="display:flex;align-items:center;justify-content:center;min-height:200px;cursor:pointer;transition:all 0.3s ease;border:2px dashed rgba(255,255,255,0.1);">
                    <div style="text-align:center;color:#888;">
                        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 16px;opacity:0.4;transition:all 0.3s ease;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                        </svg>
                        <h3 style="color:#fff;margin:0 0 8px 0;font-size:18px;transition:all 0.3s ease;">No projects yet</h3>
                        <p style="margin:0;transition:all 0.3s ease;">Click to create your first project</p>
                    </div>
                </div>
            `;

            // Add click handler and hover effects for the empty state card
            const card = document.getElementById("create-first-project-card");
            card?.addEventListener("click", async () => {
                await createNewProject(router);
            });

            card?.addEventListener("mouseenter", () => {
                card.style.background = "rgba(255, 255, 255, 0.03)";
                card.style.borderColor = "rgba(255, 255, 255, 0.2)";
                const svg = card.querySelector("svg");
                const h3 = card.querySelector("h3");
                const p = card.querySelector("p");
                if (svg) (svg as SVGElement).style.opacity = "0.6";
                if (h3) (h3 as HTMLElement).style.color = "#10B981";
                if (p) (p as HTMLElement).style.color = "#aaa";
            });

            card?.addEventListener("mouseleave", () => {
                card.style.background = "";
                card.style.borderColor = "rgba(255, 255, 255, 0.1)";
                const svg = card.querySelector("svg");
                const h3 = card.querySelector("h3");
                const p = card.querySelector("p");
                if (svg) (svg as SVGElement).style.opacity = "0.4";
                if (h3) (h3 as HTMLElement).style.color = "#fff";
                if (p) (p as HTMLElement).style.color = "#888";
            });

            return;
        }

        grid.innerHTML = "";
        for (const project of recentProjects) {
            const card = createProjectCard(project, router, false);
            grid.appendChild(card);
        }
    } catch (error) {
        console.error("Failed to load overview:", error);
    }
}

// ─── Projects Tab ───────────────────────────────────────────────────────

async function loadProjectsTab(router: IRouter): Promise<void> {
    try {
        const projects = await projectService.getProjects();
        const starredProjects = await projectService.getStarredProjects();
        const { shareService, projectCollaboratorService } = await import("chili-core");
        const sharedProjects = await shareService.getSharedProjects();

        // Get user's own projects that have collaborators (collaborative projects they own)
        const collaborativeOwnProjects = [];
        console.log(`Checking ${projects.length} projects for collaborators...`);
        for (const project of projects) {
            try {
                const collaborators = await projectCollaboratorService.getCollaborators(
                    project.sessionId,
                    project.userId,
                );
                console.log(
                    `Project "${project.projectName}" (${project.sessionId}) has ${collaborators.length} collaborator(s):`,
                    collaborators.map((c) => c.email),
                );
                // If project has more than 1 collaborator (owner + others), it's collaborative
                if (collaborators.length > 1) {
                    console.log(
                        `✓ Project "${project.projectName}" is collaborative (${collaborators.length} collaborators)`,
                    );
                    collaborativeOwnProjects.push(project);
                }
            } catch (error) {
                // Skip projects that don't have collaborators subcollection yet
                console.log(
                    `⚠ No collaborators subcollection for project "${project.projectName}" (${project.sessionId})`,
                    error,
                );
            }
        }
        console.log(`Found ${collaborativeOwnProjects.length} collaborative own projects`);
        console.log(`Found ${sharedProjects.length} shared projects`);

        // Combine shared projects and own collaborative projects
        const allCollaborativeProjects = [...sharedProjects, ...collaborativeOwnProjects];

        // Load starred projects
        const starredGrid = document.getElementById("starred-projects-grid");
        if (starredGrid) {
            if (starredProjects.length === 0) {
                starredGrid.innerHTML = `
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;cursor:default;">
                        <div style="text-align:center;color:#888;">
                            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 12px;">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            <p>Star your favorite projects to see them here</p>
                        </div>
                    </div>
                `;
            } else {
                starredGrid.innerHTML = "";
                for (const project of starredProjects) {
                    const card = createProjectCard(project, router, true);
                    starredGrid.appendChild(card);
                }
            }
        }

        // Load my projects
        const myGrid = document.getElementById("my-projects-grid");
        if (myGrid) {
            if (projects.length === 0) {
                myGrid.innerHTML = `
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;cursor:default;">
                        <div style="text-align:center;color:#888;">
                            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 12px;">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                            </svg>
                            <p>No projects yet. Click "New Project" to get started.</p>
                        </div>
                    </div>
                `;
            } else {
                myGrid.innerHTML = "";
                for (const project of projects) {
                    const card = createProjectCard(project, router, true);
                    myGrid.appendChild(card);
                }
            }
        }

        // Load collaborative projects (shared with me + my projects with collaborators)
        const collabGrid = document.getElementById("collaborative-projects-grid");
        if (collabGrid) {
            if (allCollaborativeProjects.length === 0) {
                collabGrid.innerHTML = `
                    <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;cursor:default;">
                        <div style="text-align:center;color:#888;">
                            <p>No collaborative projects yet</p>
                        </div>
                    </div>
                `;
            } else {
                collabGrid.innerHTML = "";
                // Render shared projects (projects shared with me) - fetch owner names and project names
                for (const share of sharedProjects) {
                    console.log("Share data:", share);

                    // Try to get owner name/email in order of preference:
                    // 1. ownerEmail from share (if available)
                    // 2. displayName from users collection
                    // 3. email from users collection
                    // 4. fallback to userId

                    let ownerName = "Unknown User";

                    // Check if share has ownerEmail field (new shares will have this)
                    if ((share as any).ownerEmail) {
                        ownerName = (share as any).ownerEmail.split("@")[0];
                        console.log("Using ownerEmail from share:", ownerName);
                    } else {
                        // Fallback: try to fetch from users collection
                        try {
                            const ownerDoc = await getDoc(doc(db, "users", share.sharedBy));
                            if (ownerDoc.exists()) {
                                const ownerData = ownerDoc.data();
                                ownerName =
                                    ownerData.displayName || ownerData.email?.split("@")[0] || share.sharedBy;
                                console.log("Using data from users collection:", ownerName);
                            } else {
                                console.log("Owner document not found, using userId");
                                ownerName = share.sharedBy;
                            }
                        } catch (error) {
                            console.error("Failed to fetch owner name:", error);
                            ownerName = share.sharedBy;
                        }
                    }

                    (share as any).ownerName = ownerName;

                    // Fetch actual project name from Firestore
                    let projectName = "Shared Project";
                    try {
                        const projectDoc = await getDoc(
                            doc(db, "users", share.sharedBy, "projects", share.projectId),
                        );
                        if (projectDoc.exists()) {
                            const projectData = projectDoc.data();
                            projectName = projectData.projectName || "Shared Project";
                            console.log("Fetched project name:", projectName);
                        }
                    } catch (error) {
                        console.error("Failed to fetch project name:", error);
                    }

                    (share as any).projectName = projectName;
                    console.log("Final owner name:", ownerName, "Project name:", projectName);
                    const card = createSharedProjectCard(share, router);
                    collabGrid.appendChild(card);
                }
                // Render own collaborative projects (my projects with collaborators)
                for (const project of collaborativeOwnProjects) {
                    const card = createProjectCard(project, router, true);
                    collabGrid.appendChild(card);
                }
            }
        }
    } catch (error) {
        console.error("Failed to load projects tab:", error);
    }
}

function createProjectCard(project: any, router: IRouter, showDelete: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = "project-glass-card";
    card.style.position = "relative";
    card.style.cursor = "pointer";

    const isStarred = project.starred === true;

    card.innerHTML = `
        <div class="project-preview">
            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        </div>
        <div class="project-info-modern">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <h3 style="margin:0;flex:1;">${escapeHtml(project.projectName)}</h3>
                <button class="project-history-btn" title="View edit history" style="background:rgba(100,100,100,0.2);border:none;color:#888;border-radius:4px;padding:4px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    History
                </button>
            </div>
            <p class="project-time">Updated ${formatTimeAgo(project.lastModified)}</p>
            <div class="project-tags">
                <span class="tag-modern">${project.fileUrl ? "Saved" : "New"}</span>
            </div>
        </div>
        <div class="project-actions" style="position:absolute;top:12px;right:12px;display:flex;gap:6px;">
            <button class="project-star-btn" data-starred="${isStarred}" title="${isStarred ? "Unstar project" : "Star project"}" style="background:${isStarred ? "linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,180,0,0.25))" : "rgba(255,255,255,0.08)"};border:1px solid ${isStarred ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.12)"};color:${isStarred ? "#ffd700" : "#888"};border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;backdrop-filter:blur(10px);">
                <svg width="18" height="18" fill="${isStarred ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
            </button>
            ${
                showDelete
                    ? `<button class="project-delete-btn" title="Delete project" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#ff6b6b;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;backdrop-filter:blur(10px);">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>`
                    : ""
            }
        </div>
    `;

    // Star button
    const starBtn = card.querySelector(".project-star-btn");
    starBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentStarred = starBtn.getAttribute("data-starred") === "true";
        const newStarred = !currentStarred;

        try {
            // Update in Firestore
            await projectService.toggleStarProject(project.sessionId, newStarred);

            // Update UI
            starBtn.setAttribute("data-starred", String(newStarred));
            starBtn.setAttribute("title", newStarred ? "Unstar project" : "Star project");

            const svg = starBtn.querySelector("svg");
            if (svg) {
                if (newStarred) {
                    svg.setAttribute("fill", "currentColor");
                    (starBtn as HTMLElement).style.background =
                        "linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,180,0,0.25))";
                    (starBtn as HTMLElement).style.borderColor = "rgba(255,215,0,0.4)";
                    (starBtn as HTMLElement).style.color = "#ffd700";
                } else {
                    svg.setAttribute("fill", "none");
                    (starBtn as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                    (starBtn as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                    (starBtn as HTMLElement).style.color = "#888";
                }
            }

            // Update project object
            project.starred = newStarred;

            // Reload the projects tab if we're on it to update starred section
            const projectsTab = document.getElementById("tab-projects");
            if (projectsTab && projectsTab.style.display !== "none") {
                loadProjectsTab(router);
            }
        } catch (error) {
            console.error("Failed to toggle star:", error);
            alert("Failed to update star status. Please try again.");
        }
    });

    // History button
    const historyBtn = card.querySelector(".project-history-btn");
    historyBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        showProjectHistoryDialog(project, router);
    });

    // Delete button
    if (showDelete) {
        const deleteBtn = card.querySelector(".project-delete-btn");
        deleteBtn?.addEventListener("click", async (e) => {
            e.stopPropagation();
            const confirmed = await showCustomConfirm(`Delete project "${project.projectName}"?`);
            if (!confirmed) return;
            try {
                await projectService.deleteProject(project.sessionId);
                card.remove();
                await showCustomAlert("Project deleted successfully", "success");
            } catch (err) {
                console.error("Failed to delete project:", err);
                await showCustomAlert("Failed to delete project", "error");
            }
        });
    }

    // Click card to open
    card.addEventListener("click", () => {
        localStorage.setItem("currentSessionId", project.sessionId);
        localStorage.setItem("currentProjectName", project.projectName);
        localStorage.setItem("currentProjectOwnerId", project.userId);
        localStorage.setItem("currentUserPermission", "owner"); // Owner has full permissions
        router.navigate(`/editor?sessionId=${project.sessionId}`);
    });

    return card;
}

function createSharedProjectCard(share: any, router: IRouter): HTMLElement {
    const card = document.createElement("div");
    card.className = "project-glass-card";
    card.style.position = "relative";

    // Get owner name and project name
    const ownerName = share.ownerName || "Unknown User";
    const projectName = share.projectName || "Shared Project";

    card.innerHTML = `
        <div class="project-preview">
            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
        </div>
        <div class="project-info-modern">
            <h3>${escapeHtml(projectName)}</h3>
            <p class="project-time">Shared with you</p>
            <div class="project-tags">
                <span class="tag-modern" style="background:rgba(16,185,129,0.15);color:#10B981;border:1px solid rgba(16,185,129,0.3);">Collaborator</span>
            </div>
            <div class="project-history" style="margin-top:8px;font-size:12px;color:#888;">
                <div>Shared by ${escapeHtml(ownerName)}</div>
            </div>
        </div>
        <div class="project-actions" style="position:absolute;top:8px;right:8px;">
            <button class="project-exit-btn" title="Leave project" style="background:rgba(239,68,68,0.15);border:none;color:#ef4444;border-radius:6px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </button>
        </div>
    `;

    // Exit button
    const exitBtn = card.querySelector(".project-exit-btn");
    exitBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();

        const confirmed = await showCustomConfirm(
            `Leave "${projectName}"? You will no longer have access to this project.`,
        );

        if (!confirmed) return;

        try {
            const { shareService } = await import("chili-core");
            await shareService.leaveProject(share.projectId, share.sharedBy);
            card.remove();
            showCustomAlert("Left project successfully", "success");
        } catch (err) {
            console.error("Failed to leave project:", err);
            showCustomAlert("Failed to leave project", "error");
        }
    });

    // Hover effect for exit button
    exitBtn?.addEventListener("mouseenter", () => {
        (exitBtn as HTMLElement).style.background = "rgba(239,68,68,0.25)";
    });
    exitBtn?.addEventListener("mouseleave", () => {
        (exitBtn as HTMLElement).style.background = "rgba(239,68,68,0.15)";
    });

    // Click card to open
    card.addEventListener("click", () => {
        localStorage.setItem("currentSessionId", share.projectId);
        localStorage.setItem("currentProjectName", projectName);
        localStorage.setItem("currentProjectOwnerId", share.sharedBy);
        localStorage.setItem("currentUserPermission", share.permission); // Set user's permission level
        router.navigate(`/editor?sessionId=${share.projectId}&owner=${share.sharedBy}`);
    });

    return card;
}

// ─── Teams Tab ──────────────────────────────────────────────────────────

async function loadTeams(router: IRouter): Promise<void> {
    const grid = document.getElementById("teams-grid");
    if (!grid) return;

    try {
        const { teamService } = await import("chili-core");
        const teams = await teamService.getMyTeams();

        if (teams.length === 0) {
            grid.innerHTML = `
                <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;cursor:default;">
                    <div style="text-align:center;color:#888;">
                        <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin:0 auto 12px;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <p>No teams yet. Click "Create Team" to get started.</p>
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = "";
        for (const team of teams) {
            const card = document.createElement("div");
            card.className = "project-glass-card";
            card.style.cursor = "pointer";
            card.innerHTML = `
                <div class="project-preview">
                    <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                </div>
                <div class="project-info-modern">
                    <h3>${escapeHtml(team.name)}</h3>
                    <p class="project-time">${team.members.length} members • ${team.projectIds.length} projects</p>
                    <div class="project-tags">
                        <span class="tag-modern">Member</span>
                    </div>
                </div>
                <div class="project-actions" style="position: absolute; top: 12px; right: 12px; display: flex; gap: 8px;">
                    <button class="delete-team-btn" data-team-id="${team.id}" style="background: #2d2d2d; border: 1px solid #404040; border-radius: 6px; padding: 6px 10px; color: #ff4444; cursor: pointer; font-size: 12px; transition: all 0.2s;" title="Delete Team">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            `;

            // Click to open team management
            card.addEventListener("click", (e) => {
                // Don't open if clicking delete button
                if ((e.target as HTMLElement).closest(".delete-team-btn")) return;
                openTeamManagement(team);
            });

            // Delete button handler
            const deleteBtn = card.querySelector(".delete-team-btn");
            deleteBtn?.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete the team "${team.name}"?`)) {
                    try {
                        await teamService.deleteTeam(team.id);
                        loadTeams(router);
                        alert("Team deleted successfully!");
                    } catch (error) {
                        console.error("Failed to delete team:", error);
                        alert("Failed to delete team. You must be the team owner.");
                    }
                }
            });

            grid.appendChild(card);
        }
    } catch (error) {
        console.error("Failed to load teams:", error);
        grid.innerHTML = `
            <div class="project-glass-card" style="display:flex;align-items:center;justify-content:center;min-height:150px;">
                <p style="color:#ff4444;">Failed to load teams.</p>
            </div>
        `;
    }
}

// ─── Create Team Dialog Functions ───────────────────────────────────────

const selectedFriends = new Set<string>();
const inviteEmails = new Set<string>();

async function loadCreateTeamDialog(router: IRouter): Promise<void> {
    // Reset selections
    selectedFriends.clear();
    inviteEmails.clear();

    // Clear inputs
    const teamNameInput = document.getElementById("team-name-input") as HTMLInputElement;
    const teamDescInput = document.getElementById("team-description-input") as HTMLTextAreaElement;
    const projectNameInput = document.getElementById("team-project-name-input") as HTMLInputElement;
    if (teamNameInput) teamNameInput.value = "";
    if (teamDescInput) teamDescInput.value = "";
    if (projectNameInput) projectNameInput.value = "";

    // Load friends list
    try {
        const { friendService } = await import("chili-core");
        const friends = await friendService.getFriends();

        console.log("Loaded friends for team dialog:", friends);

        const friendsList = document.getElementById("friends-selection-list");
        if (!friendsList) {
            console.error("Friends list element not found");
            return;
        }

        if (friends.length === 0) {
            friendsList.innerHTML = `
                <div style="text-align: center; color: #666; padding: 20px; font-size: 13px;">
                    No friends yet. Add friends to invite them to your team.
                </div>
            `;
        } else {
            friendsList.innerHTML = "";
            for (const friend of friends) {
                const friendItem = document.createElement("label");
                friendItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                friendItem.innerHTML = `
                    <input type="checkbox" class="friend-checkbox" data-friend-id="${friend.friendId}" data-friend-email="${escapeHtml(friend.friendEmail)}" style="cursor: pointer;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px;">
                        ${friend.friendName.charAt(0).toUpperCase()}
                    </div>
                    <div style="flex: 1;">
                        <div style="color: white; font-size: 13px; font-weight: 500;">${escapeHtml(friend.friendName)}</div>
                        <div style="color: #888; font-size: 11px;">${escapeHtml(friend.friendEmail)}</div>
                    </div>
                `;

                friendItem.addEventListener("mouseenter", () => {
                    friendItem.style.background = "rgba(255, 255, 255, 0.05)";
                });
                friendItem.addEventListener("mouseleave", () => {
                    friendItem.style.background = "transparent";
                });

                const checkbox = friendItem.querySelector(".friend-checkbox") as HTMLInputElement;
                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        selectedFriends.add(friend.friendId);
                    } else {
                        selectedFriends.delete(friend.friendId);
                    }
                });

                friendsList.appendChild(friendItem);
            }
        }
    } catch (error) {
        console.error("Failed to load friends:", error);
        const friendsList = document.getElementById("friends-selection-list");
        if (friendsList) {
            friendsList.innerHTML = `
                <div style="text-align: center; color: #ff4444; padding: 20px; font-size: 13px;">
                    Failed to load friends. Please try again.
                </div>
            `;
        }
    }

    // Load existing projects
    try {
        const projects = await projectService.getProjects();
        const select = document.getElementById("team-existing-project-select") as HTMLSelectElement;
        if (select) {
            select.innerHTML =
                '<option value="" style="background: #1a1a1a; color: white;">Select a project...</option>';
            for (const project of projects) {
                const option = document.createElement("option");
                option.value = project.sessionId;
                option.textContent = project.projectName;
                option.style.background = "#1a1a1a";
                option.style.color = "white";
                select.appendChild(option);
            }
        }
    } catch (error) {
        console.error("Failed to load projects:", error);
    }
}

function addInviteEmailTag(email: string): void {
    if (inviteEmails.has(email)) {
        alert("Email already added");
        return;
    }

    inviteEmails.add(email);

    const invitesList = document.getElementById("team-invites-list");
    if (!invitesList) return;

    const tag = document.createElement("div");
    tag.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(59, 130, 246, 0.15);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 6px;
        color: #3b82f6;
        font-size: 12px;
    `;
    tag.innerHTML = `
        <span>${escapeHtml(email)}</span>
        <button style="background: none; border: none; color: #3b82f6; cursor: pointer; padding: 0; font-size: 14px; line-height: 1;">×</button>
    `;

    const removeBtn = tag.querySelector("button");
    removeBtn?.addEventListener("click", () => {
        inviteEmails.delete(email);
        tag.remove();
    });

    invitesList.appendChild(tag);
}

async function handleCreateTeam(router: IRouter): Promise<void> {
    const teamNameInput = document.getElementById("team-name-input") as HTMLInputElement;
    const teamDescInput = document.getElementById("team-description-input") as HTMLTextAreaElement;
    const projectNameInput = document.getElementById("team-project-name-input") as HTMLInputElement;
    const existingProjectSelect = document.getElementById(
        "team-existing-project-select",
    ) as HTMLSelectElement;

    const teamName = teamNameInput?.value.trim();
    if (!teamName) {
        alert("Please enter a team name");
        return;
    }

    const teamDescription = teamDescInput?.value.trim() || "";

    // Get project option
    const projectOption = (document.querySelector('input[name="project-option"]:checked') as HTMLInputElement)
        ?.value;
    let projectId = "";
    let projectName = "";

    if (projectOption === "new") {
        projectName = projectNameInput?.value.trim();
        if (!projectName) {
            alert("Please enter a project name");
            return;
        }
    } else {
        projectId = existingProjectSelect?.value;
        if (!projectId) {
            alert("Please select an existing project");
            return;
        }
        projectName = existingProjectSelect?.options[existingProjectSelect.selectedIndex]?.text || "";
    }

    try {
        const { teamService, friendService, projectService } = await import("chili-core");

        console.log("Starting team creation...");
        console.log("Team name:", teamName);
        console.log("Project option:", projectOption);
        console.log("Selected friends:", selectedFriends.size);
        console.log("Invite emails:", inviteEmails.size);

        // Get friend emails
        const friendEmails: string[] = [];
        for (const friendId of selectedFriends) {
            const friends = await friendService.getFriends();
            const friend = friends.find((f) => f.friendId === friendId);
            if (friend) {
                friendEmails.push(friend.friendEmail);
            }
        }
        console.log("Friend emails:", friendEmails);

        // Combine friend emails and invite emails
        const allInvites = [...friendEmails, ...Array.from(inviteEmails)];
        console.log("All invites:", allInvites);

        // Create new project if needed
        if (projectOption === "new") {
            console.log("Creating new project:", projectName);
            const newProject = await projectService.createProject(projectName);
            projectId = newProject.sessionId;
            console.log("New project created with ID:", projectId);
        } else {
            console.log("Using existing project ID:", projectId);
        }

        // Create team
        console.log("Creating team...");
        const team = await teamService.createTeam(teamName, teamDescription);
        console.log("Team created with ID:", team.id);

        // Add project to team and update project's teamId
        if (projectId) {
            console.log("Adding project to team...");
            await teamService.addProjectToTeam(team.id, projectId);

            // Update project to include teamId
            const user = auth.currentUser;
            if (user) {
                const projectRef = doc(db, "users", user.uid, "projects", projectId);
                await updateDoc(projectRef, { teamId: team.id });
            }
            console.log("Project added to team");
        }

        // Send invitations
        console.log("Sending invitations...");
        for (const email of allInvites) {
            try {
                await teamService.inviteToTeam(team.id, email);
                console.log(`Invitation sent to ${email}`);
            } catch (error) {
                console.error(`Failed to invite ${email}:`, error);
            }
        }

        // Close dialog
        const dialog = document.getElementById("create-team-dialog");
        if (dialog) dialog.style.display = "none";

        // Reload teams
        loadTeams(router);

        alert(
            `Team "${teamName}" created successfully!${allInvites.length > 0 ? `\nInvitations sent to ${allInvites.length} people.` : ""}`,
        );
    } catch (error) {
        console.error("Failed to create team - detailed error:", error);
        console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
        alert(
            `Failed to create team: ${error instanceof Error ? error.message : "Unknown error"}. Please check console for details.`,
        );
    }
}

// ─── Team Management Dialog Functions ───────────────────────────────────

async function openTeamManagement(team: any): Promise<void> {
    const dialog = document.getElementById("team-management-dialog");
    if (!dialog) return;

    // Set team name in title
    const titleEl = document.getElementById("team-management-title");
    if (titleEl) titleEl.textContent = `${team.name} - Management`;

    // Show dialog
    dialog.style.display = "flex";

    // Load members
    await loadTeamMembers(team);

    // Load projects
    await loadTeamProjects(team);

    // Setup add member button
    const addMemberBtn = document.getElementById("add-member-btn");
    const addMemberInput = document.getElementById("add-member-email-input") as HTMLInputElement;

    const handleAddMember = async () => {
        const email = addMemberInput?.value.trim();
        if (!email) {
            alert("Please enter an email address");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert("Please enter a valid email address");
            return;
        }

        try {
            const { teamService } = await import("chili-core");
            await teamService.inviteToTeam(team.id, email);
            alert(`Invitation sent to ${email}`);
            addMemberInput.value = "";
        } catch (error) {
            console.error("Failed to invite member:", error);
            alert("Failed to send invitation. Please try again.");
        }
    };

    // Remove old listeners and add new one
    const newAddMemberBtn = addMemberBtn?.cloneNode(true) as HTMLElement;
    addMemberBtn?.parentNode?.replaceChild(newAddMemberBtn, addMemberBtn);
    newAddMemberBtn?.addEventListener("click", handleAddMember);

    // Setup add project button
    const addProjectBtn = document.getElementById("add-project-to-team-btn");
    const handleAddProject = async () => {
        try {
            // Get user's projects
            const projects = await projectService.getProjects();

            // Filter out projects already in the team
            const availableProjects = projects.filter((p) => !team.projectIds.includes(p.sessionId));

            if (availableProjects.length === 0) {
                await showCustomAlert(
                    "No available projects to add. All your projects are already in this team.",
                    "info",
                );
                return;
            }

            // Show custom project selection dialog
            const selectedProject = await showProjectSelectionDialog(availableProjects);
            if (!selectedProject) return;

            // Add project to team
            const { teamService } = await import("chili-core");
            await teamService.addProjectToTeam(team.id, selectedProject.sessionId);

            // Update project's teamId
            const user = auth.currentUser;
            if (user) {
                const projectRef = doc(db, "users", user.uid, "projects", selectedProject.sessionId);
                await updateDoc(projectRef, { teamId: team.id });
            }

            await showCustomAlert(
                `Project "${selectedProject.projectName}" added to team successfully!`,
                "success",
            );

            // Reload projects list
            await loadTeamProjects(team);
        } catch (error) {
            console.error("Failed to add project:", error);
            await showCustomAlert("Failed to add project. Please try again.", "error");
        }
    };

    // Remove old listeners and add new one
    const newAddProjectBtn = addProjectBtn?.cloneNode(true) as HTMLElement;
    addProjectBtn?.parentNode?.replaceChild(newAddProjectBtn, addProjectBtn);
    newAddProjectBtn?.addEventListener("click", handleAddProject);
}

function showProjectSelectionDialog(projects: any[]): Promise<any | null> {
    return new Promise((resolve) => {
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
            min-width: 500px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        `;

        const projectList = projects
            .map(
                (project, index) => `
            <div class="project-selection-item" data-index="${index}" style="
                padding: 16px;
                margin: 8px 0;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
            ">
                <div style="
                    width: 32px;
                    height: 32px;
                    background: linear-gradient(135deg, #10B981, #059669);
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-weight: 600;
                    font-size: 14px;
                ">${index + 1}</div>
                <div style="flex: 1;">
                    <div style="color: #fff; font-weight: 500; margin-bottom: 4px;">${escapeHtml(project.projectName)}</div>
                    <div style="color: #888; font-size: 12px;">Click to select</div>
                </div>
            </div>
        `,
            )
            .join("");

        dialog.innerHTML = `
            <h3 style="color: #fff; font-size: 1.25rem; margin: 0 0 20px 0; font-weight: 500;">Select a project to add to the team</h3>
            <div id="project-list-container">
                ${projectList}
            </div>
            <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
                <button id="project-select-cancel" style="
                    padding: 10px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Add hover effects to project items
        const projectItems = dialog.querySelectorAll(".project-selection-item");
        projectItems.forEach((item) => {
            item.addEventListener("mouseenter", () => {
                (item as HTMLElement).style.background = "rgba(16, 185, 129, 0.15)";
                (item as HTMLElement).style.borderColor = "#10B981";
                (item as HTMLElement).style.transform = "translateX(4px)";
            });
            item.addEventListener("mouseleave", () => {
                (item as HTMLElement).style.background = "rgba(255, 255, 255, 0.05)";
                (item as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.1)";
                (item as HTMLElement).style.transform = "";
            });
            item.addEventListener("click", () => {
                const index = parseInt((item as HTMLElement).getAttribute("data-index") || "0");
                resolve(projects[index]);
                cleanup();
            });
        });

        const cancelBtn = document.getElementById("project-select-cancel");
        cancelBtn?.addEventListener("mouseenter", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.08)";
        });
        cancelBtn?.addEventListener("mouseleave", () => {
            cancelBtn.style.background = "rgba(255, 255, 255, 0.05)";
        });

        const cleanup = () => {
            overlay.style.animation = "fadeOut 0.2s ease";
            setTimeout(() => overlay.remove(), 200);
        };

        cancelBtn?.addEventListener("click", () => {
            resolve(null);
            cleanup();
        });

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                resolve(null);
                cleanup();
            }
        });
    });
}

async function loadTeamMembers(team: any): Promise<void> {
    const membersList = document.getElementById("team-members-list");
    if (!membersList) return;

    membersList.innerHTML =
        '<div style="text-align: center; color: #888; padding: 20px;">Loading members...</div>';

    try {
        const { teamService } = await import("chili-core");
        const fullTeam = await teamService.getTeam(team.id);
        if (!fullTeam) {
            membersList.innerHTML =
                '<div style="text-align: center; color: #ff4444; padding: 20px;">Failed to load team</div>';
            return;
        }

        if (fullTeam.members.length === 0) {
            membersList.innerHTML =
                '<div style="text-align: center; color: #888; padding: 20px;">No members yet</div>';
            return;
        }

        membersList.innerHTML = "";
        for (const member of fullTeam.members) {
            const memberCard = document.createElement("div");
            memberCard.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: #2d2d2d;
                border: 1px solid #404040;
                border-radius: 8px;
                margin-bottom: 8px;
            `;

            const isOwner = member.role === "owner";
            const roleColor = isOwner ? "#4ade80" : "#888";

            memberCard.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #404040; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 16px;">
                    ${member.displayName.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="color: white; font-size: 14px; font-weight: 500;">${escapeHtml(member.displayName)}</div>
                    <div style="color: #888; font-size: 12px;">${escapeHtml(member.email)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: ${roleColor}; font-size: 12px; font-weight: 500; text-transform: uppercase;">${member.role}</span>
                    ${!isOwner ? `<button class="remove-member-btn" data-member-id="${member.uid}" style="background: transparent; border: 1px solid #ff4444; color: #ff4444; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">Remove</button>` : ""}
                </div>
            `;

            // Remove member handler
            if (!isOwner) {
                const removeBtn = memberCard.querySelector(".remove-member-btn");
                removeBtn?.addEventListener("click", async () => {
                    if (confirm(`Remove ${member.displayName} from the team?`)) {
                        try {
                            await teamService.removeMember(team.id, member.uid);
                            await loadTeamMembers(team);
                            alert("Member removed successfully");
                        } catch (error) {
                            console.error("Failed to remove member:", error);
                            alert("Failed to remove member. You must be the team owner.");
                        }
                    }
                });
            }

            membersList.appendChild(memberCard);
        }
    } catch (error) {
        console.error("Failed to load members:", error);
        membersList.innerHTML =
            '<div style="text-align: center; color: #ff4444; padding: 20px;">Failed to load members</div>';
    }
}

async function loadTeamProjects(team: any): Promise<void> {
    const projectsList = document.getElementById("team-projects-list");
    if (!projectsList) return;

    projectsList.innerHTML =
        '<div style="text-align: center; color: #888; padding: 20px;">Loading projects...</div>';

    try {
        const user = auth.currentUser;
        if (!user) return;

        if (!team.projectIds || team.projectIds.length === 0) {
            projectsList.innerHTML =
                '<div style="text-align: center; color: #888; padding: 20px;">No projects yet</div>';
            return;
        }

        projectsList.innerHTML = "";
        for (const projectId of team.projectIds) {
            // Try to get project from current user first, then from team owner
            let project = await projectService.getProject(projectId);

            // If not found in current user's projects, try getting from team owner
            if (!project && team.ownerId !== user.uid) {
                project = await projectService.getProjectInfo(projectId, team.ownerId);
            }

            if (!project) {
                console.warn(`Project ${projectId} not found`);
                continue;
            }

            const projectCard = document.createElement("div");
            projectCard.style.cssText = `
                padding: 12px;
                background: #2d2d2d;
                border: 1px solid #404040;
                border-radius: 8px;
                margin-bottom: 8px;
                transition: all 0.2s;
            `;

            projectCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="margin: 0; color: white; font-size: 14px; font-weight: 600;">${escapeHtml(project.projectName)}</h4>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="open-project-btn" data-project-id="${projectId}" data-owner-id="${project.userId}" style="background: #2d2d2d; border: 1px solid #404040; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; transition: all 0.2s;">
                            Open
                        </button>
                        <svg class="toggle-history-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #888; cursor: pointer;">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
                <div style="color: #888; font-size: 12px;">Click arrow to view edit history</div>
                <div id="project-history-${projectId}" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #404040;"></div>
            `;

            // Open project button handler
            const openBtn = projectCard.querySelector(".open-project-btn");
            openBtn?.addEventListener("click", (e) => {
                e.stopPropagation();
                const ownerId = (e.target as HTMLElement).getAttribute("data-owner-id");
                const sessionId = (e.target as HTMLElement).getAttribute("data-project-id");
                if (sessionId && ownerId) {
                    // Navigate to editor with project ID and owner ID
                    window.location.href = `/editor?sessionId=${sessionId}&ownerId=${ownerId}`;
                }
            });

            // Add hover effect to open button
            openBtn?.addEventListener("mouseenter", () => {
                (openBtn as HTMLElement).style.background = "#3a3a3a";
                (openBtn as HTMLElement).style.borderColor = "#505050";
            });
            openBtn?.addEventListener("mouseleave", () => {
                (openBtn as HTMLElement).style.background = "#2d2d2d";
                (openBtn as HTMLElement).style.borderColor = "#404040";
            });

            // Toggle history on arrow click
            const toggleIcon = projectCard.querySelector(".toggle-history-icon");
            toggleIcon?.addEventListener("click", async (e) => {
                e.stopPropagation();
                const historyDiv = document.getElementById(`project-history-${projectId}`);
                if (!historyDiv) return;

                if (historyDiv.style.display === "none") {
                    // Load and show history
                    historyDiv.style.display = "block";
                    historyDiv.innerHTML =
                        '<div style="text-align: center; color: #888; padding: 12px; font-size: 12px;">Loading history...</div>';

                    try {
                        const { projectHistoryService } = await import("chili-core");
                        console.log("Loading history for project:", projectId, "owner:", project.userId);

                        let history = [];
                        try {
                            history = await projectHistoryService.getHistory(projectId, project.userId);
                            console.log("History loaded:", history.length, "entries");
                        } catch (historyError) {
                            console.warn(
                                "Could not load history (subcollection may not exist):",
                                historyError,
                            );
                            // History subcollection doesn't exist yet - this is normal for new projects
                        }

                        if (history.length === 0) {
                            historyDiv.innerHTML = `
                                <div style="text-align: center; padding: 20px;">
                                    <svg width="48" height="48" fill="none" stroke="#888" viewBox="0 0 24 24" style="margin: 0 auto 12px;">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div style="color: #888; font-size: 13px; margin-bottom: 8px;">No edit history yet</div>
                                    <div style="color: #666; font-size: 11px; line-height: 1.5;">
                                        History will appear when collaborators save changes.<br>
                                        Each save creates a snapshot showing:<br>
                                        • Who made the change<br>
                                        • When it was made<br>
                                        • What was changed<br>
                                        • Downloadable version
                                    </div>
                                </div>
                            `;
                            return;
                        }

                        historyDiv.innerHTML = "";
                        for (const change of history) {
                            const changeItem = document.createElement("div");
                            changeItem.style.cssText = `
                                padding: 8px;
                                background: #1a1a1a;
                                border-radius: 6px;
                                margin-bottom: 6px;
                            `;

                            const actionColors: Record<string, string> = {
                                created: "#4ade80",
                                modified: "#3b82f6",
                                renamed: "#f59e0b",
                                shared: "#8b5cf6",
                                deleted: "#ef4444",
                            };

                            const actionColor = actionColors[change.action] || "#888";
                            const timestamp = new Date(change.timestamp).toLocaleString();
                            const hasFileUrl = change.fileUrl && change.fileUrl.trim() !== "";

                            changeItem.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                                    <div style="flex: 1;">
                                        <div style="color: white; font-size: 12px; font-weight: 500;">${escapeHtml(change.userName)}</div>
                                        <div style="color: #888; font-size: 11px;">${escapeHtml(change.userEmail)}</div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style="color: ${actionColor}; font-size: 11px; font-weight: 500; text-transform: uppercase; background: ${actionColor}22; padding: 2px 6px; border-radius: 4px;">${change.action}</span>
                                        ${hasFileUrl ? `<button class="view-version-btn" data-file-url="${escapeHtml(change.fileUrl || "")}" style="background: #2d2d2d; border: 1px solid #404040; color: #3b82f6; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 500;">View</button>` : ""}
                                    </div>
                                </div>
                                <div style="color: #ccc; font-size: 11px; margin-bottom: 4px;">${escapeHtml(change.description)}</div>
                                <div style="color: #666; font-size: 10px;">${timestamp}${hasFileUrl ? " • Snapshot saved" : ""}</div>
                            `;

                            // Add view version button handler
                            if (hasFileUrl) {
                                const viewBtn = changeItem.querySelector(".view-version-btn");
                                viewBtn?.addEventListener("click", (e) => {
                                    e.stopPropagation();
                                    const fileUrl = (e.target as HTMLElement).getAttribute("data-file-url");
                                    if (fileUrl) {
                                        // Open the version in a new tab or download it
                                        if (
                                            confirm(
                                                "Do you want to download this version or view it?\n\nOK = Download\nCancel = View in new tab",
                                            )
                                        ) {
                                            // Download
                                            const link = document.createElement("a");
                                            link.href = fileUrl;
                                            link.download = `${project.projectName}_${change.id}.cd`;
                                            link.click();
                                        } else {
                                            // View in new tab
                                            window.open(fileUrl, "_blank");
                                        }
                                    }
                                });

                                // Add hover effect
                                const viewBtn2 = changeItem.querySelector(".view-version-btn");
                                viewBtn2?.addEventListener("mouseenter", () => {
                                    (viewBtn2 as HTMLElement).style.background = "#3a3a3a";
                                    (viewBtn2 as HTMLElement).style.borderColor = "#505050";
                                });
                                viewBtn2?.addEventListener("mouseleave", () => {
                                    (viewBtn2 as HTMLElement).style.background = "#2d2d2d";
                                    (viewBtn2 as HTMLElement).style.borderColor = "#404040";
                                });
                            }

                            historyDiv.appendChild(changeItem);
                        }
                    } catch (error) {
                        console.error("Failed to load project history:", error);
                        console.error("Project ID:", projectId, "Owner ID:", project.userId);
                        historyDiv.innerHTML =
                            '<div style="text-align: center; color: #ff4444; padding: 12px; font-size: 12px;">Failed to load history</div>';
                    }
                } else {
                    // Hide history
                    historyDiv.style.display = "none";
                }
            });

            projectsList.appendChild(projectCard);
        }
    } catch (error) {
        console.error("Failed to load projects:", error);
        projectsList.innerHTML =
            '<div style="text-align: center; color: #ff4444; padding: 20px;">Failed to load projects</div>';
    }
}
