// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { button, div, span } from "chili-controls";
import { authService, type IApplication, Logger } from "chili-core";
import style from "./aiChat.module.css";

interface Message {
    role: "user" | "assistant" | "loading" | "question" | "typing" | "tool";
    content: string;
    questions?: Question[];
    streaming?: boolean;
    metadata?: Record<string, unknown>;
}

interface Question {
    question: string;
    options?: (string | { label: string; value: string })[];
    key?: string;
}

interface WebSocketData {
    type: string;
    intent?: string;
    confidence?: number;
    content?: string;
    metadata?: Record<string, unknown>;
    data?: Record<string, unknown>;
    questions?: Question[];
    message?: string;
    download_urls?: Record<string, string>;
    download_url?: string;
    files?: Record<string, string>;
}

const TOKENS_PER_CREDIT = 1000;
const TOKENS_PER_IMAGE = 1500;
const DEFAULT_OUTPUT_TOKENS = 500;

function calculateCredits(params: { prompt: string; imagesCount: number }): number {
    const inputTokens = Math.ceil(params.prompt.length / 4);
    const imageTokens = params.imagesCount * TOKENS_PER_IMAGE;
    const totalTokens = inputTokens + imageTokens + DEFAULT_OUTPUT_TOKENS;
    const credits = Math.ceil(totalTokens / TOKENS_PER_CREDIT);
    return Math.max(credits, 1);
}

export class AIChatPanel extends HTMLElement {
    private messages: Message[] = [];
    private messagesContainer: HTMLDivElement;
    private inputField: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private isProcessing: boolean = false;
    private sessionId: string;
    private uid: string;
    private ws: WebSocket | null = null;
    private currentMessageElement: HTMLDivElement | null = null;
    private currentMessage: Message | null = null;
    private currentContentElement: HTMLDivElement | null = null;
    private wsConnected: boolean = false;
    private connectionDot: HTMLDivElement;
    private agentStatusElement: HTMLDivElement | null = null;
    private modelTypeSelect: HTMLSelectElement;
    private modelType: string = "openai";
    private imageUploadButton: HTMLButtonElement;
    private imageInput: HTMLInputElement;
    private selectedImage: File | null = null;
    private imagePreviewContainer: HTMLDivElement | null = null;

    constructor(
        private readonly app: IApplication,
        sessionId?: string,
    ) {
        super();
        this.className = style.chatContainer;

        this.messagesContainer = div({ className: style.chatMessages });
        this.inputField = document.createElement("textarea") as HTMLTextAreaElement;
        this.inputField.className = style.inputField;
        this.inputField.placeholder = "Ask Copilot...";

        // Resolve session ID: constructor param > URL > localStorage > generate
        this.sessionId = sessionId || this.resolveSessionId();
        Logger.info(`AIChatPanel initialized with session ID: ${this.sessionId}`);
        // Use authenticated user's UID
        const currentUser = authService.getCurrentUser();
        this.uid = currentUser?.uid ?? "anonymous";

        this.sendButton = button({
            className: style.sendButton,
            textContent: "\u2191",
            onclick: () => this.handleSendMessage(),
        }) as HTMLButtonElement;

        this.modelTypeSelect = document.createElement("select");
        this.modelTypeSelect.className = style.modelTypeSelect;
        const openaiOption = document.createElement("option");
        openaiOption.value = "openai";
        openaiOption.textContent = "OpenAI";
        const geminiOption = document.createElement("option");
        geminiOption.value = "gemini";
        geminiOption.textContent = "Gemini";
        this.modelTypeSelect.appendChild(openaiOption);
        this.modelTypeSelect.appendChild(geminiOption);
        this.modelTypeSelect.addEventListener("change", (e) => {
            this.modelType = (e.target as HTMLSelectElement).value;
        });

        // Create hidden file input for image upload
        this.imageInput = document.createElement("input");
        this.imageInput.type = "file";
        this.imageInput.accept = "image/*";
        this.imageInput.style.display = "none";
        this.imageInput.addEventListener("change", (e) => this.handleImageSelect(e));

        // Create image upload button
        this.imageUploadButton = button({
            className: style.imageUploadButton,
            textContent: "📎",
            title: "Attach Image",
            onclick: () => this.imageInput.click(),
        }) as HTMLButtonElement;

        this.connectionDot = div({ className: style.connectionDot });

        this.render();
        this.setupInputHandlers();
        // Don't connect WebSocket here — the session ID may not be available yet
        // (Editor is created during app build, before the router navigates to /editor?sessionId=xxx).
        // Connection will be established when the chat panel is shown via ensureConnection().
    }

    private handleImageSelect(event: Event) {
        console.log("=== handleImageSelect called ===");
        const input = event.target as HTMLInputElement;
        console.log("Input files:", input.files);
        if (input.files && input.files[0]) {
            this.selectedImage = input.files[0];
            console.log(
                "Selected image set to:",
                this.selectedImage.name,
                this.selectedImage.type,
                this.selectedImage.size,
            );
            this.showImagePreview(this.selectedImage);
        }
    }

    private showImagePreview(file: File) {
        // Remove existing preview container if any (but don't clear selectedImage)
        if (this.imagePreviewContainer) {
            this.imagePreviewContainer.remove();
            this.imagePreviewContainer = null;
        }

        // Create preview container
        this.imagePreviewContainer = div({ className: style.imagePreview });

        // Create image element
        const img = document.createElement("img");
        img.className = style.previewImage;
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);

        // Create remove button
        const removeBtn = button({
            className: style.removeImageButton,
            textContent: "✕",
            onclick: () => this.removeImagePreview(),
        }) as HTMLButtonElement;

        this.imagePreviewContainer.appendChild(img);
        this.imagePreviewContainer.appendChild(removeBtn);

        // Insert preview before input field
        const inputWrapper = this.querySelector(`.${style.inputWrapper}`) as HTMLElement;
        if (inputWrapper) {
            inputWrapper.insertBefore(this.imagePreviewContainer, this.inputField);
        }
    }

    private removeImagePreview() {
        console.log("=== removeImagePreview called ===");
        if (this.imagePreviewContainer) {
            this.imagePreviewContainer.remove();
            this.imagePreviewContainer = null;
        }
        this.selectedImage = null;
        this.imageInput.value = "";
        console.log("Image preview removed, selectedImage set to null");
    }

    private async convertImageToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(",")[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Resolve the best available session ID from URL params and localStorage.
     */
    private resolveSessionId(): string {
        const urlParams = new URLSearchParams(window.location.search);
        const urlSessionId = urlParams.get("sessionId") || urlParams.get("session");
        const storageSessionId = localStorage.getItem("currentSessionId");
        const resolved = urlSessionId || storageSessionId || this.generateUUID();
        Logger.info(
            `AIChatPanel resolveSessionId: ${resolved} (source: ${urlSessionId ? "URL" : storageSessionId ? "localStorage" : "generated"})`,
        );
        return resolved;
    }

    /**
     * Ensure the WebSocket is connected with the correct project session ID.
     * Call this when the chat panel becomes visible.
     */
    ensureConnection() {
        // Always re-resolve the session ID from current URL/localStorage
        const currentSessionId = this.resolveSessionId();

        if (currentSessionId !== this.sessionId) {
            Logger.info(`AIChatPanel: session ID changed from ${this.sessionId} to ${currentSessionId}`);
            this.sessionId = currentSessionId;
            // Close stale connection so we reconnect with the correct ID
            if (this.ws) {
                this.ws.onclose = null; // Prevent auto-reconnect with old ID
                this.ws.close();
                this.ws = null;
                this.wsConnected = false;
            }
        }

        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.connectWebSocket();
        }
    }

    /**
     * Update the session ID and reconnect the WebSocket.
     * Use this when the project session ID becomes available after initial construction.
     */
    updateSessionId(newSessionId: string) {
        if (this.sessionId === newSessionId) return;
        Logger.info(`AIChatPanel: updating session ID from ${this.sessionId} to ${newSessionId}`);
        this.sessionId = newSessionId;
        // Close existing connection and reconnect with new session ID
        if (this.ws) {
            this.ws.onclose = null; // Prevent auto-reconnect with old ID
            this.ws.close();
            this.ws = null;
        }
        this.connectWebSocket();
    }

    private generateUUID(): string {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    private connectWebSocket() {
        const wsUrl = `wss://venus-215301763138.europe-west1.run.app/ws/chat/${this.sessionId}`;
        Logger.info("Connecting to WebSocket:", wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                Logger.info("WebSocket connected");
                this.wsConnected = true;
                this.updateConnectionStatus(true);
            };

            this.ws.onclose = () => {
                Logger.info("WebSocket disconnected");
                this.wsConnected = false;
                this.updateConnectionStatus(false);
                // Attempt to reconnect after 2 seconds
                setTimeout(() => this.connectWebSocket(), 2000);
            };

            this.ws.onerror = (error) => {
                Logger.error("WebSocket error:", error);
                // Don't add empty messages on error
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    Logger.error("Error parsing WebSocket message:", error);
                }
            };
        } catch (error) {
            Logger.error("Failed to create WebSocket:", error);
            this.wsConnected = false;
            this.updateConnectionStatus(false);
        }
    }

    private async updateConnectionStatus(connected: boolean) {
        if (connected) {
            this.connectionDot.className = `${style.connectionDot} ${style.connected}`;
            // Check credits before enabling input
            await this.loadCredits();
        } else {
            this.connectionDot.className = `${style.connectionDot} ${style.disconnected}`;
            this.sendButton.disabled = true;
            this.inputField.disabled = true;
        }
    }

    private handleWebSocketMessage(data: WebSocketData) {
        console.log("🔔 WebSocket Message Received:", data);
        console.log("Message Type:", data.type);
        Logger.info("Received WebSocket message:", data);

        switch (data.type) {
            case "intent_detected":
                this.handleIntentDetection(data);
                break;

            case "typing":
                this.showTypingIndicator();
                break;

            case "tool_executing":
                this.showToolExecution(data);
                break;

            case "response_chunk":
                this.appendTextChunk(data);
                break;

            case "questions":
                this.showClarifyingQuestions(data);
                break;

            case "complete":
                console.log("🎉 COMPLETE MESSAGE RECEIVED");
                this.handleComplete(data);
                break;

            case "error":
                this.showError(data);
                break;

            default:
                console.warn("❓ Unknown message type:", data.type);
                Logger.warn("Unknown message type:", data.type);
        }
    }

    private handleIntentDetection(data: WebSocketData) {
        const confidence = Math.round((data.confidence || 0) * 100);
        Logger.info(`Intent detected: ${data.intent} (${confidence}% confident)`);

        const statusLabel = (data.intent ?? "").replace(/_/g, " ");
        const displayText = `${statusLabel.charAt(0).toUpperCase()}${statusLabel.slice(1)}...`;
        this.showAgentStatus(displayText);
    }

    private showTypingIndicator() {
        this.removeTypingIndicator();

        const typingDiv = div({ className: style.typingIndicator });
        const avatarEl = div({ className: `${style.avatar} ${style.assistantAvatar}` });
        avatarEl.textContent = "\u2726";
        const dotsWrapper = div({ className: style.typingDots });
        dotsWrapper.innerHTML = "<span></span><span></span><span></span>";
        typingDiv.appendChild(avatarEl);
        typingDiv.appendChild(dotsWrapper);
        this.messagesContainer.appendChild(typingDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private removeTypingIndicator() {
        const typingIndicators = this.messagesContainer.querySelectorAll(`.${style.typingIndicator}`);
        typingIndicators.forEach((indicator) => {
            indicator.remove();
        });
    }

    private showToolExecution(data: WebSocketData) {
        this.removeTypingIndicator();

        const toolMessage: Message = {
            role: "tool",
            content: (data.data?.description as string) || `Running ${data.data?.tool as string}...`,
        };

        const messageEl = this.createMessageElement(toolMessage);
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        this.messages.push(toolMessage);
    }

    private appendTextChunk(data: WebSocketData) {
        this.removeTypingIndicator();
        this.removeAgentStatus();

        // Don't create messages with empty or undefined content
        if (!data.content) {
            return;
        }

        if (!this.currentMessage || !this.currentMessageElement) {
            this.currentMessage = {
                role: "assistant",
                content: data.content,
                streaming: true,
                metadata: data.metadata,
            };
            this.currentMessageElement = this.createMessageElement(this.currentMessage);
            this.currentContentElement = this.currentMessageElement.querySelector(
                `.${style.messageContent}`,
            ) as HTMLDivElement;
            this.currentMessageElement.classList.add(style.streaming);
            this.messagesContainer.appendChild(this.currentMessageElement);
            this.messages.push(this.currentMessage);
        } else {
            this.currentMessage.content += data.content;
            if (this.currentContentElement) {
                this.currentContentElement.innerHTML = this.formatMessageContent(this.currentMessage.content);
            }
        }

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private showClarifyingQuestions(data: WebSocketData) {
        this.removeTypingIndicator();
        this.finalizeCurrentMessage();

        if (data.questions && data.questions.length > 0) {
            // Show interactive question form
            this.showQuestionForm(data.questions);

            // Hide normal input while questions are active
            this.inputField.style.display = "none";
            this.sendButton.style.display = "none";
        }
    }

    private async handleComplete(data: WebSocketData) {
        console.log("🎯 handleComplete called");
        console.log("Complete data structure:", JSON.stringify(data, null, 2));

        this.removeTypingIndicator();
        this.finalizeCurrentMessage();

        Logger.info("Response complete - Full data:", JSON.stringify(data, null, 2));

        // Hide agent status after completion
        this.removeAgentStatus();

        // Try multiple possible paths for download URL
        let downloadUrl = null;

        console.log("Checking data.data:", data.data);
        console.log("Checking data.data?.download_urls:", data.data?.download_urls);
        console.log("Checking data.data?.download_url:", data.data?.download_url);
        console.log("Checking data.data?.files:", data.data?.files);

        if (data.data?.download_urls) {
            // Backend returns download_urls object with step/stl keys
            const urls = data.data.download_urls as Record<string, string>;
            downloadUrl =
                urls.step ||
                urls.stl ||
                Object.values(urls).find((u: unknown) => typeof u === "string" && (u as string).length > 0);
            console.log("✅ Found in data.data.download_urls:", downloadUrl);
        } else if (data.data?.download_url) {
            downloadUrl = data.data.download_url as string;
            console.log("✅ Found in data.data.download_url:", downloadUrl);
        } else if (data.download_urls) {
            const urls = data.download_urls;
            downloadUrl =
                urls.step ||
                urls.stl ||
                Object.values(urls).find((u: unknown) => typeof u === "string" && (u as string).length > 0);
            console.log("✅ Found in data.download_urls:", downloadUrl);
        } else if (data.download_url) {
            downloadUrl = data.download_url;
            console.log("✅ Found in data.download_url:", downloadUrl);
        } else if (data.data?.files) {
            // Check for files object
            const files = data.data.files as Record<string, string>;
            if (files.step) {
                downloadUrl = files.step;
                console.log("✅ Found in data.data.files.step:", downloadUrl);
            } else if (files.stl) {
                downloadUrl = files.stl;
                console.log("✅ Found in data.data.files.stl:", downloadUrl);
            }
        } else if (data.files) {
            // Check for files at root level
            if (data.files.step) {
                downloadUrl = data.files.step;
                console.log("✅ Found in data.files.step:", downloadUrl);
            } else if (data.files.stl) {
                downloadUrl = data.files.stl;
                console.log("✅ Found in data.files.stl:", downloadUrl);
            }
        }

        // Auto-download and import model if available
        if (downloadUrl) {
            console.log("🚀 Attempting to download and import from:", downloadUrl);
            Logger.info("Found download URL:", downloadUrl);
            const fullUrl = downloadUrl.startsWith("http")
                ? downloadUrl
                : `http://localhost:8000${downloadUrl}`;
            console.log("Full URL:", fullUrl);
            Logger.info("Full URL:", fullUrl);

            try {
                await this.downloadAndImportFromUrl(fullUrl);
                console.log("✅ Download and import completed successfully");
            } catch (error) {
                console.error("❌ Error during download/import:", error);
            }
        } else {
            console.error("❌ NO DOWNLOAD URL FOUND!");
            console.log("Complete data was:", data);
            Logger.warn("No download URL found in complete message");
        }

        // Re-enable processing and check credits
        this.isProcessing = false;
        await this.loadCredits();
    }

    private async showError(data: WebSocketData) {
        this.removeTypingIndicator();
        this.removeAgentStatus();
        this.finalizeCurrentMessage();

        const errorMessage = (data.data?.message as string) || data.message || "An error occurred";
        this.addMessage({
            role: "assistant",
            content: `\u274C ${errorMessage}`,
        });

        this.isProcessing = false;

        // Refund credits on error
        try {
            const { creditsService, auth } = await import("chili-core");
            const user = auth.currentUser;
            if (user) {
                // Get the last message to calculate refund
                const lastUserMessage = this.messages.filter((m) => m.role === "user").pop();
                if (lastUserMessage) {
                    const refundAmount = calculateCredits({
                        prompt: lastUserMessage.content,
                        imagesCount: lastUserMessage.content.includes("📎") ? 1 : 0,
                    });
                    await creditsService.addCredits(user.uid, refundAmount);
                    console.log(`💳 Refunded ${refundAmount} credits due to error`);
                }
            }
        } catch (error) {
            console.error("Error refunding credits:", error);
        }

        await this.loadCredits();
    }

    private finalizeCurrentMessage() {
        if (this.currentMessageElement && this.currentMessage) {
            this.currentMessageElement.classList.remove(style.streaming);
            this.currentMessage.streaming = false;
        }
        this.currentMessageElement = null;
        this.currentContentElement = null;
        this.currentMessage = null;
    }

    private showAgentStatus(statusText: string) {
        this.removeAgentStatus();

        const statusRow = div({ className: style.agentStatusRow });
        const sparkle = span({
            className: style.statusSparkle,
            textContent: "\u2726",
        });
        const text = span({
            className: style.statusText,
            textContent: statusText,
        });

        statusRow.appendChild(sparkle);
        statusRow.appendChild(text);

        this.agentStatusElement = statusRow;
        this.messagesContainer.appendChild(statusRow);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private removeAgentStatus() {
        if (this.agentStatusElement) {
            this.agentStatusElement.remove();
            this.agentStatusElement = null;
        }
    }

    private render() {
        const closeBtn = button({
            className: style.closeButton,
            textContent: "\u2715",
            onclick: () => this.close(),
        }) as HTMLButtonElement;

        // Create credits display element
        const creditsDisplay = div({ className: style.creditsDisplay });
        creditsDisplay.innerHTML = `
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink: 0;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="${style.creditsValue}" id="ai-chat-credits-value">--</span>
        `;

        const header = div(
            { className: style.chatHeader },
            div(
                { className: style.headerLeft },
                span({ className: style.copilotIcon, textContent: "\u2726" }),
                div({ className: style.chatTitle, textContent: "CAD Copilot" }),
                creditsDisplay,
            ),
            div({ className: style.headerActions }, this.connectionDot, closeBtn),
        );

        const inputWrapper = div(
            { className: style.inputWrapper },
            this.modelTypeSelect,
            this.inputField,
            this.imageUploadButton,
        );

        const inputContainer = div({ className: style.chatInput }, inputWrapper, this.sendButton);

        const resizer = div({
            className: style.chatResizer,
            onmousedown: (e: MouseEvent) => this.startResize(e),
        });

        this.append(resizer, header, this.messagesContainer, inputContainer);

        // Load credits after render
        this.loadCredits();
    }

    private startResize(e: MouseEvent) {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = this.offsetWidth;

        const onMouseMove = (ev: MouseEvent) => {
            const diff = startX - ev.clientX;
            const newWidth = Math.max(300, Math.min(600, startWidth + diff));
            this.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }

    private setupInputHandlers() {
        this.inputField.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });

        this.inputField.addEventListener("input", () => {
            this.inputField.style.height = "auto";
            this.inputField.style.height = `${Math.min(this.inputField.scrollHeight, 120)}px`;
        });
    }

    private async handleSendMessage() {
        console.log("=== handleSendMessage START ===");
        console.log("this.selectedImage:", this.selectedImage);
        console.log("this.inputField.value:", this.inputField.value);
        console.log("this.isProcessing:", this.isProcessing);

        const prompt = this.inputField.value.trim();
        const hasImage = this.selectedImage !== null;

        if ((!prompt && !hasImage) || this.isProcessing) {
            console.log("❌ Validation failed - returning");
            return;
        }

        // Check credits before sending
        try {
            const { creditsService, auth } = await import("chili-core");
            const user = auth.currentUser;

            if (!user) {
                this.addMessage({
                    role: "assistant",
                    content: "❌ Please log in to use the AI Copilot.",
                });
                return;
            }

            const currentCredits = await creditsService.getCredits(user.uid);

            // Calculate required credits
            const requiredCredits = calculateCredits({
                prompt: prompt,
                imagesCount: hasImage ? 1 : 0,
            });

            console.log(`💳 Credits check: Current=${currentCredits}, Required=${requiredCredits}`);

            if (currentCredits < requiredCredits) {
                this.addMessage({
                    role: "assistant",
                    content: `❌ Insufficient credits. You need ${requiredCredits} credits but have ${currentCredits}. Please purchase more credits.`,
                });
                return;
            }

            // Deduct credits before sending
            const deductSuccess = await creditsService.deductCredits(user.uid, requiredCredits);

            if (!deductSuccess) {
                this.addMessage({
                    role: "assistant",
                    content: "❌ Failed to deduct credits. Please try again.",
                });
                return;
            }

            console.log(`✅ Deducted ${requiredCredits} credits`);

            // Update credits display
            await this.loadCredits();
        } catch (error) {
            console.error("❌ Error checking/deducting credits:", error);
            this.addMessage({
                role: "assistant",
                content: "❌ Error processing credits. Please try again.",
            });
            return;
        }

        // Ensure we're connected with the correct session ID before sending
        this.ensureConnection();

        if (!this.wsConnected) {
            console.log("❌ WebSocket not connected - returning");
            return;
        }

        // IMPORTANT: Capture these BEFORE clearing anything
        const messageToSend = prompt;
        const imageToSend = this.selectedImage;

        console.log("✅ Captured for sending:");
        console.log("  - messageToSend:", messageToSend);
        console.log(
            "  - imageToSend:",
            imageToSend ? `${imageToSend.name} (${imageToSend.size} bytes)` : "null",
        );

        // Now set processing state and clear UI
        this.isProcessing = true;
        this.sendButton.disabled = true;
        this.inputField.disabled = true;
        this.inputField.value = "";
        this.inputField.style.height = "40px";

        // Add user message to UI
        const displayMessage = imageToSend ? `${prompt || "Image attached"} 📎` : prompt;
        this.addMessage({ role: "user", content: displayMessage });

        // Send via WebSocket
        console.log("📤 Calling sendWebSocketMessage...");
        await this.sendWebSocketMessage(messageToSend, imageToSend);
        console.log("=== handleSendMessage END ===");
    }

    private async sendWebSocketMessage(message: string, imageFile: File | null = null) {
        console.log("=== sendWebSocketMessage START ===");
        console.log("  - message:", message);
        console.log("  - imageFile:", imageFile ? `${imageFile.name} (${imageFile.size} bytes)` : "null");

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log("❌ WebSocket not open");
            this.addMessage({
                role: "assistant",
                content: "❌ Not connected to server. Reconnecting...",
            });
            this.isProcessing = false;
            this.sendButton.disabled = false;
            this.inputField.disabled = false;
            return;
        }

        // Build the data object with the required format
        const data: Record<string, unknown> = {
            message: message,
            uid: this.uid,
            type: "user_message", // Default type
            image: null, // Always include image field
            model_type: this.modelType,
        };

        // If image is provided, convert to base64 and update type
        if (imageFile) {
            try {
                console.log("🖼️ Converting image to base64...");
                const base64Image = await this.convertImageToBase64(imageFile);
                console.log("✅ Image converted, length:", base64Image.length);

                // Store as data URL or base64 string based on your backend needs
                data.image = base64Image; // You can change this to a URL if needed
                data.image_type = imageFile.type;

                // Set type based on whether there's both image and text
                if (message && message.trim().length > 0) {
                    data.type = "both";
                    console.log("📝 Type set to: both (image + text)");
                } else {
                    data.type = "image";
                    console.log("📝 Type set to: image (only)");
                }

                // Remove the preview after preparing the data
                this.removeImagePreview();
            } catch (error) {
                console.error("❌ Error converting image:", error);
                Logger.error("Error converting image:", error);
                this.addMessage({
                    role: "assistant",
                    content: `❌ Error processing image: ${error instanceof Error ? error.message : "Unknown error"}`,
                });
                this.isProcessing = false;
                this.sendButton.disabled = false;
                this.inputField.disabled = false;
                return;
            }
        } else {
            console.log("📝 Type set to: user_message (text only, no image)");
        }

        try {
            console.log("=== Preparing to send ===");
            console.log("📤 Request data:", JSON.stringify(data, null, 2));

            const jsonString = JSON.stringify(data);
            console.log("  - JSON length:", jsonString.length);

            this.ws.send(jsonString);
            console.log("✅ WebSocket message sent successfully!");
            Logger.info("Sent message with type:", data.type);
        } catch (error) {
            console.error("❌ Error sending message:", error);
            Logger.error("Error sending message:", error);
            this.addMessage({
                role: "assistant",
                content: `❌ Error sending message: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
            this.isProcessing = false;
            this.sendButton.disabled = false;
            this.inputField.disabled = false;
        }

        console.log("=== sendWebSocketMessage END ===");
    }

    private showQuestionForm(questions: Question[]) {
        const formContainer = div({ className: style.questionFormContainer });

        const title = div({
            className: style.questionFormTitle,
            textContent: "Please answer the following questions:",
        });
        formContainer.appendChild(title);

        const answersMap = new Map<
            number,
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | string
        >();

        questions.forEach((q, index) => {
            const questionBlock = div({ className: style.questionBlock });

            const questionLabel = div({
                className: style.questionLabel,
                textContent: `${index + 1}. ${q.question}`,
            });
            questionBlock.appendChild(questionLabel);

            if (q.options && q.options.length > 0) {
                // Create selectable buttons for options
                const optionsContainer = div({ className: style.questionButtons });

                q.options.forEach((option, optionIndex) => {
                    let optLbl: string;
                    if (typeof option === "object" && option !== null) {
                        optLbl = option.label;
                    } else {
                        optLbl = option as string;
                    }

                    const optionButton = button({
                        className: style.optionButton,
                        textContent: optLbl,
                        onclick: (e: Event) => {
                            // Just select this option, don't submit yet
                            const btn = e.target as HTMLButtonElement;

                            // Deselect all buttons in this question
                            optionsContainer.querySelectorAll("button").forEach((b) => {
                                b.classList.remove(style.optionButtonSelected);
                            });

                            // Select this button
                            btn.classList.add(style.optionButtonSelected);

                            // Store the answer
                            answersMap.set(index, optLbl);
                        },
                    }) as HTMLButtonElement;

                    // Select first option by default
                    if (optionIndex === 0) {
                        optionButton.classList.add(style.optionButtonSelected);
                        answersMap.set(index, optLbl);
                    }

                    optionsContainer.appendChild(optionButton);
                });

                questionBlock.appendChild(optionsContainer);
            } else {
                // Free text input for questions without options
                const textInput = document.createElement("textarea") as HTMLTextAreaElement;
                textInput.className = style.questionTextInput;
                textInput.placeholder = "Enter your answer...";
                textInput.rows = 2;
                questionBlock.appendChild(textInput);
                answersMap.set(index, textInput);
            }

            formContainer.appendChild(questionBlock);
        });

        // Always show submit button
        const submitButton = button({
            className: style.submitAnswersButton,
            textContent: "Submit Answers",
            onclick: async () => {
                // Collect all answers
                const answers: string[] = [];
                questions.forEach((_q, index) => {
                    const value = answersMap.get(index);
                    if (typeof value === "string") {
                        answers.push(value);
                    } else if (value) {
                        answers.push(value.value);
                    }
                });

                // Remove the form
                formContainer.remove();

                // Show submitted answers
                const answersText = answers.join(", ");
                this.addMessage({
                    role: "user",
                    content: answersText,
                });

                // Restore normal input
                this.inputField.style.display = "";
                this.sendButton.style.display = "";

                // Send answers via WebSocket
                await this.sendWebSocketMessage(answersText);
            },
        }) as HTMLButtonElement;

        formContainer.appendChild(submitButton);

        this.messagesContainer.appendChild(formContainer);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private async downloadAndImportFromUrl(fileUrl: string) {
        try {
            console.log("📥 downloadAndImportFromUrl called with:", fileUrl);
            Logger.info("Starting download from URL:", fileUrl);

            this.addMessage({
                role: "assistant",
                content: "Downloading model file...",
            });

            let response: Response;
            try {
                console.log("Fetching from URL...");
                response = await fetch(fileUrl, {
                    method: "GET",
                    mode: "cors",
                });
                console.log("Fetch response:", response.status, response.statusText);
                Logger.info("Fetch response status:", response.status, response.statusText);
            } catch (fetchError) {
                console.error("❌ Fetch error:", fetchError);
                Logger.error("Fetch error:", fetchError);
                throw new Error("Cannot connect to download server");
            }

            if (!response.ok) {
                console.error("❌ Response not OK:", response.status);
                throw new Error(`Failed to download file (${response.status}): ${response.statusText}`);
            }

            console.log("Converting to blob...");
            const blob = await response.blob();
            console.log("Blob size:", blob.size, "bytes");

            // Determine file type and name from URL
            const fileExtension = fileUrl.split(".").pop()?.toLowerCase() || "step";
            const fileName = `generated_model.${fileExtension}`;
            const mimeType = fileExtension === "stl" ? "model/stl" : "application/step";

            console.log("Creating File object:", fileName, mimeType);
            const file = new File([blob], fileName, { type: mimeType });

            this.removeLastMessage();
            this.addMessage({
                role: "assistant",
                content: "Importing model into the scene...",
            });

            console.log("Getting or creating document...");
            // Import the file into the application
            const document = this.app.activeView?.document ?? (await this.app.newDocument("Untitled"));
            console.log("Document ready, importing file...");

            await this.app.dataExchange.import(document, [file]);
            console.log("✅ Import successful!");

            this.removeLastMessage();
            this.addMessage({
                role: "assistant",
                content: "Model imported successfully! ✓",
            });

            // Fit the view to the new content
            if (this.app.activeView?.cameraController) {
                console.log("Fitting camera to content...");
                setTimeout(() => {
                    this.app.activeView?.cameraController.fitContent();
                }, 100);
            }
        } catch (error) {
            console.error("❌ Error in downloadAndImportFromUrl:", error);
            Logger.error("Error importing file:", error);
            this.removeLastMessage();
            this.addMessage({
                role: "assistant",
                content: `Error importing model: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
        }
    }

    private formatMessageContent(content: string): string {
        // Convert markdown-style formatting to HTML
        let formatted = content;

        // Convert **bold** to <strong>
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        // Convert line breaks to <br>
        formatted = formatted.replace(/\n/g, "<br>");

        // Convert numbered lists (e.g., "1. Item" or "**1. Item**")
        formatted = formatted.replace(/^(\d+)\.\s+/gm, "<br><strong>$1.</strong> ");

        // Convert bullet points
        formatted = formatted.replace(/^[-*]\s+/gm, "<br>• ");

        return formatted;
    }

    private createMessageElement(message: Message): HTMLDivElement {
        const row = div({ className: style.messageRow });

        const avatarEl = div({ className: style.avatar });
        if (message.role === "user") {
            avatarEl.classList.add(style.userAvatar);
            avatarEl.textContent = "U";
        } else if (message.role === "tool") {
            avatarEl.classList.add(style.toolAvatar);
            avatarEl.textContent = "\u2699";
        } else {
            avatarEl.classList.add(style.assistantAvatar);
            avatarEl.textContent = "\u2726";
        }

        const contentWrapper = div({ className: style.messageContentWrapper });

        const senderName = div({ className: style.senderName });
        if (message.role === "user") {
            senderName.textContent = "You";
        } else if (message.role === "tool") {
            senderName.textContent = "Tool";
        } else {
            senderName.textContent = "CAD Copilot";
        }

        const contentEl = div({ className: style.messageContent });
        if (message.role === "user") {
            contentEl.classList.add(style.userMessage);
        } else if (message.role === "loading") {
            contentEl.classList.add(style.loadingMessage);
        } else if (message.role === "tool") {
            contentEl.classList.add(style.toolMessage);
        } else {
            contentEl.classList.add(style.assistantMessage);
        }

        // Use innerHTML for assistant messages to support formatting
        if (message.role === "assistant" || message.role === "tool") {
            contentEl.innerHTML = this.formatMessageContent(message.content);
        } else {
            contentEl.textContent = message.content;
        }

        contentWrapper.appendChild(senderName);
        contentWrapper.appendChild(contentEl);
        row.appendChild(avatarEl);
        row.appendChild(contentWrapper);

        return row;
    }

    private addMessage(message: Message) {
        // Don't add messages with empty content (except for loading/typing indicators)
        if (!message.content && message.role !== "loading" && message.role !== "typing") {
            console.warn("Attempted to add message with empty content, skipping:", message);
            return;
        }

        this.messages.push(message);
        const messageEl = this.createMessageElement(message);
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private removeLastMessage() {
        if (this.messages.length > 0) {
            this.messages.pop();
            const lastChild = this.messagesContainer.lastElementChild;
            if (lastChild) {
                this.messagesContainer.removeChild(lastChild);
            }
        }
    }

    private close() {
        // Close WebSocket connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.remove();
    }

    private async loadCredits(): Promise<void> {
        try {
            const { creditsService, auth } = await import("chili-core");
            const user = auth.currentUser;

            if (!user) {
                Logger.warn("No user logged in for credits display");
                const creditsValueEl = document.getElementById("ai-chat-credits-value");
                if (creditsValueEl) {
                    creditsValueEl.textContent = "--";
                }
                return;
            }

            const credits = await creditsService.getCredits(user.uid);
            const creditsValueEl = document.getElementById("ai-chat-credits-value");

            if (creditsValueEl) {
                creditsValueEl.textContent = credits.toString();
            }

            // Disable input if no credits
            if (credits === 0) {
                this.inputField.disabled = true;
                this.sendButton.disabled = true;
                this.imageUploadButton.disabled = true;
                this.inputField.placeholder = "No credits available. Please purchase more credits.";
            } else {
                // Only enable if not processing and connected
                if (!this.isProcessing && this.wsConnected) {
                    this.inputField.disabled = false;
                    this.sendButton.disabled = false;
                    this.imageUploadButton.disabled = false;
                    this.inputField.placeholder = "Ask Copilot...";
                }
            }
        } catch (error) {
            Logger.error("Error loading credits in AI chat:", error);
            const creditsValueEl = document.getElementById("ai-chat-credits-value");
            if (creditsValueEl) {
                creditsValueEl.textContent = "0";
            }
        }
    }

    // Cleanup on disconnect
    disconnectedCallback() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

customElements.define("chili-ai-chat-panel", AIChatPanel);
