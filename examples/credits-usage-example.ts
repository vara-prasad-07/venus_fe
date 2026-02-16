// Example: How to use the Credits System in your components

import { auth, creditsService } from "chili-core";

// ─── Example 1: Check if user has enough credits before an action ───────

async function performPremiumAction() {
    const user = auth.currentUser;
    if (!user) {
        console.error("User not authenticated");
        return;
    }

    const requiredCredits = 10;
    const currentCredits = await creditsService.getCredits(user.uid);

    if (currentCredits < requiredCredits) {
        alert(`Insufficient credits. You need ${requiredCredits} credits but have ${currentCredits}.`);
        return;
    }

    // Deduct credits
    const success = await creditsService.deductCredits(user.uid, requiredCredits);

    if (success) {
        console.log("Credits deducted. Performing action...");
        // Perform your premium action here

        // Refresh credits display if needed
        await refreshCreditsDisplay();
    } else {
        alert("Failed to deduct credits. Please try again.");
    }
}

// ─── Example 2: Reward user with credits ───────────────────────────────

async function rewardUserForAction(creditsToAdd: number) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await creditsService.addCredits(user.uid, creditsToAdd);
        console.log(`Added ${creditsToAdd} credits to user account`);

        // Refresh credits display
        await refreshCreditsDisplay();

        // Show success message
        alert(`Congratulations! You earned ${creditsToAdd} credits!`);
    } catch (error) {
        console.error("Error adding credits:", error);
    }
}

// ─── Example 3: Display credits in a custom component ──────────────────

async function displayCreditsInComponent() {
    const user = auth.currentUser;
    if (!user) return;

    const credits = await creditsService.getCredits(user.uid);

    // Update your UI element
    const creditsElement = document.getElementById("my-credits-display");
    if (creditsElement) {
        creditsElement.textContent = `${credits} credits`;
    }
}

// ─── Example 4: Refresh credits display in dashboard ───────────────────

async function refreshCreditsDisplay() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const credits = await creditsService.getCredits(user.uid);
        const creditsValueEl = document.getElementById("credits-value");

        if (creditsValueEl) {
            creditsValueEl.textContent = credits.toString();
        }
    } catch (error) {
        console.error("Error refreshing credits:", error);
    }
}

// ─── Example 5: Check credits before AI chat message ───────────────────

async function sendAIChatMessage(message: string) {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to use AI chat");
        return;
    }

    const CREDITS_PER_MESSAGE = 1;
    const currentCredits = await creditsService.getCredits(user.uid);

    if (currentCredits < CREDITS_PER_MESSAGE) {
        alert("You don't have enough credits to send a message. Please purchase more credits.");
        return;
    }

    // Deduct credits before sending message
    const success = await creditsService.deductCredits(user.uid, CREDITS_PER_MESSAGE);

    if (!success) {
        alert("Failed to deduct credits. Please try again.");
        return;
    }

    try {
        // Send your AI chat message here
        console.log("Sending message:", message);
        // ... your AI chat logic ...

        // Refresh credits display
        await refreshCreditsDisplay();
    } catch (error) {
        // If message fails, refund the credits
        await creditsService.addCredits(user.uid, CREDITS_PER_MESSAGE);
        console.error("Error sending message:", error);
        alert("Failed to send message. Credits have been refunded.");
    }
}

// ─── Example 6: Admin function to set user credits ─────────────────────

async function adminSetUserCredits(userId: string, newAmount: number) {
    try {
        await creditsService.updateCredits(userId, newAmount);
        console.log(`Set user ${userId} credits to ${newAmount}`);
    } catch (error) {
        console.error("Error setting user credits:", error);
    }
}

// Export functions for use in other modules
export {
    performPremiumAction,
    rewardUserForAction,
    displayCreditsInComponent,
    refreshCreditsDisplay,
    sendAIChatMessage,
    adminSetUserCredits,
};
