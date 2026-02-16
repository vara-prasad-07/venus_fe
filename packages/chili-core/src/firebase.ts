// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/// <reference types="./vite-env.d.ts" />

import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    getAuth,
    onAuthStateChanged,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    type User,
} from "firebase/auth";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCR_OxYReDexDuyvTd-18bmXQ3hu6qeMJE",
    authDomain: "venus-ab3d3.firebaseapp.com",
    projectId: "venus-ab3d3",
    storageBucket: "venus-ab3d3.firebasestorage.app",
    messagingSenderId: "232838896301",
    appId: "1:232838896301:web:19e606fae22eb86d438424",
    measurementId: "G-Y7KDH49EB6",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

interface PendingRegistration {
    email: string;
    password: string;
    verificationToken: string;
    createdAt: any;
    expiresAt: any;
}

export interface AuthService {
    signInWithGoogle: () => Promise<User>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    verifyEmailAndCreateAccount: (token: string) => Promise<User>;
    signInWithEmail: (email: string, password: string) => Promise<User>;
    sendVerificationEmail: (user?: User) => Promise<void>;
    checkEmailVerified: () => Promise<boolean>;
    signOutUser: () => Promise<void>;
    getCurrentUser: () => User | null;
    onAuthChange: (callback: (user: User | null) => void) => () => void;
}

export const authService: AuthService = {
    async signInWithGoogle(): Promise<User> {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return result.user;
        } catch (error) {
            console.error("Error signing in with Google:", error);
            throw error;
        }
    },

    async signUpWithEmail(email: string, password: string): Promise<void> {
        try {
            console.log("Creating pending registration for:", email);

            // Check if email already exists in Auth
            const existingUsers = await getDocs(query(collection(db, "users"), where("email", "==", email)));
            if (!existingUsers.empty) {
                throw new Error("This email is already registered. Please sign in instead.");
            }

            // Generate verification token
            const verificationToken = crypto.randomUUID();

            // Store pending registration in Firestore
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiration

            await addDoc(collection(db, "pendingRegistrations"), {
                email,
                password, // In production, you should hash this!
                verificationToken,
                createdAt: serverTimestamp(),
                expiresAt: expiresAt.getTime(),
            });

            // Send verification email using EmailJS
            const verificationUrl = `${window.location.origin}/verify-email?token=${verificationToken}`;
            const emailJSServiceId = "service_4ibzwrh";
            const emailJSTemplateId = "template_qp9d4fq";
            const emailJSPublicKey = "FqLFbPk7ZMn1JSqWo";

            // Send email using EmailJS API
            const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    service_id: emailJSServiceId,
                    template_id: emailJSTemplateId,
                    user_id: emailJSPublicKey,
                    template_params: {
                        to_email: email,
                        to_name: email.split("@")[0],
                        verification_url: verificationUrl,
                        app_name: "Venus",
                        current_year: new Date().getFullYear().toString(),
                    },
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("EmailJS API error:", errorData);
                throw new Error(
                    `Failed to send verification email: ${errorData.message || response.statusText}`,
                );
            }

            console.log("Verification email sent successfully via EmailJS");
        } catch (error: any) {
            console.error("Error creating pending registration:", error);
            throw error;
        }
    },

    async verifyEmailAndCreateAccount(token: string): Promise<User> {
        try {
            console.log("Verifying token and creating account:", token);

            // Find pending registration
            const pendingRegs = await getDocs(
                query(collection(db, "pendingRegistrations"), where("verificationToken", "==", token)),
            );

            if (pendingRegs.empty) {
                throw new Error("Invalid or expired verification link.");
            }

            const pendingReg = pendingRegs.docs[0];
            const data = pendingReg.data() as PendingRegistration;

            // Check if expired
            if (data.expiresAt < Date.now()) {
                await deleteDoc(pendingReg.ref);
                throw new Error("Verification link has expired. Please sign up again.");
            }

            // Create Firebase Auth account
            console.log("Creating Firebase Auth account for:", data.email);
            const result = await createUserWithEmailAndPassword(auth, data.email, data.password);

            // Delete pending registration
            await deleteDoc(pendingReg.ref);

            console.log("Account created successfully!");
            return result.user;
        } catch (error: any) {
            console.error("Error verifying email and creating account:", error);
            throw error;
        }
    },

    async signInWithEmail(email: string, password: string): Promise<User> {
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            return result.user;
        } catch (error: any) {
            console.error("Error signing in with email:", error);

            // Provide user-friendly error messages
            if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
                throw new Error("Invalid email or password. Please try again.");
            } else if (error.code === "auth/user-not-found") {
                throw new Error(
                    "No account found with this email. Please check your email for the verification link.",
                );
            } else if (error.code === "auth/invalid-email") {
                throw new Error("Invalid email format. Please check your email address.");
            }

            throw error;
        }
    },

    async sendVerificationEmail(user?: User): Promise<void> {
        try {
            const currentUser = user || auth.currentUser;

            if (!currentUser) {
                throw new Error("No user is currently signed in.");
            }

            // Check if email is already verified
            if (currentUser.emailVerified) {
                throw new Error("Email is already verified.");
            }

            // Configure action code settings for the verification email
            const actionCodeSettings = {
                url: `${window.location.origin}/verify-email`,
                handleCodeInApp: false,
            };

            await sendEmailVerification(currentUser, actionCodeSettings);
            console.log("Verification email sent successfully to:", currentUser.email);
        } catch (error: any) {
            console.error("Error sending verification email:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            throw error;
        }
    },

    async checkEmailVerified(): Promise<boolean> {
        try {
            const currentUser = auth.currentUser;

            if (!currentUser) {
                return false;
            }

            // Reload user data to get the latest verification status
            await currentUser.reload();

            return currentUser.emailVerified;
        } catch (error) {
            console.error("Error checking email verification:", error);
            return false;
        }
    },

    async signOutUser(): Promise<void> {
        try {
            await signOut(auth);
            localStorage.removeItem("isAuthenticated");
            localStorage.removeItem("username");
            localStorage.removeItem("userEmail");
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    },

    getCurrentUser(): User | null {
        return auth.currentUser;
    },

    onAuthChange(callback: (user: User | null) => void): () => void {
        return onAuthStateChanged(auth, callback);
    },
};

// ─── Project Schema ─────────────────────────────────────────────────────────
// Firestore path: users/{uid}/projects/{sessionId}
// Fields: projectName, sessionId, createdDate, lastModified, fileUrl

export interface ProjectCollaborator {
    userId: string;
    email: string;
    displayName: string;
    role: "owner" | "editor" | "viewer";
    addedAt: any; // Firestore Timestamp
}

export interface ProjectChangeHistory {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    action: "created" | "modified" | "renamed" | "shared" | "deleted";
    description: string;
    fileUrl?: string; // Cloudinary URL if file was changed
    timestamp: any; // Firestore Timestamp
}

export interface ProjectData {
    projectName: string;
    sessionId: string;
    userId: string; // Owner's user ID
    createdDate: any; // Firestore Timestamp
    lastModified: any; // Firestore Timestamp
    fileUrl: string; // Cloudinary URL for the .cd file
    collaboratorIds?: string[]; // Array of user IDs (for queries)
    teamId?: string; // Optional team ID if project belongs to a team
}

export interface ProjectService {
    createProject: (projectName: string, teamId?: string) => Promise<ProjectData>;
    getProjects: () => Promise<ProjectData[]>;
    getProject: (sessionId: string) => Promise<ProjectData | null>;
    getProjectInfo: (sessionId: string, ownerId: string) => Promise<ProjectData | null>;
    updateProjectFile: (sessionId: string, fileUrl: string) => Promise<void>;
    updateProjectFileByOwner: (sessionId: string, ownerId: string, fileUrl: string) => Promise<void>;
    updateProjectName: (sessionId: string, newName: string) => Promise<void>;
    updateProjectNameByOwner: (sessionId: string, ownerId: string, newName: string) => Promise<void>;
    toggleStarProject: (sessionId: string, starred: boolean) => Promise<void>;
    getStarredProjects: () => Promise<ProjectData[]>;
    deleteProject: (sessionId: string) => Promise<void>;
}

function generateSessionId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export const projectService: ProjectService = {
    async createProject(projectName: string, teamId?: string): Promise<ProjectData> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const sessionId = generateSessionId();
        const projectData: ProjectData = {
            projectName,
            sessionId,
            userId: user.uid,
            createdDate: serverTimestamp(),
            lastModified: serverTimestamp(),
            fileUrl: "",
            collaboratorIds: [user.uid],
        };

        if (teamId) {
            projectData.teamId = teamId;
        }

        // Store at users/{uid}/projects/{sessionId}
        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        await setDoc(projectRef, projectData);

        // Add owner as first collaborator
        await projectCollaboratorService.addCollaborator(
            sessionId,
            user.uid,
            user.uid,
            user.email!,
            user.displayName || user.email!.split("@")[0],
            "owner",
        );

        // Add creation to history
        await projectHistoryService.addChange(
            sessionId,
            user.uid,
            "created",
            `Project "${projectName}" created`,
        );

        // Return with a client-side date for immediate use
        return {
            ...projectData,
            createdDate: new Date(),
            lastModified: new Date(),
        };
    },

    async getProjects(): Promise<ProjectData[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectsRef = collection(db, "users", user.uid, "projects");
        const q = query(projectsRef, orderBy("lastModified", "desc"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as ProjectData;
            return {
                ...data,
                // Ensure userId is always set (for backwards compatibility with old projects)
                userId: data.userId || user.uid,
                // Convert Firestore timestamps to JS dates for UI
                createdDate: data.createdDate?.toDate?.() ?? new Date(),
                lastModified: data.lastModified?.toDate?.() ?? new Date(),
            };
        });
    },

    async getProject(sessionId: string): Promise<ProjectData | null> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        const snap = await getDoc(projectRef);
        if (!snap.exists()) return null;

        const data = snap.data() as ProjectData;
        return {
            ...data,
            // Ensure userId is always set (for backwards compatibility with old projects)
            userId: data.userId || user.uid,
            createdDate: data.createdDate?.toDate?.() ?? new Date(),
            lastModified: data.lastModified?.toDate?.() ?? new Date(),
        };
    },

    async getProjectInfo(sessionId: string, ownerId: string): Promise<ProjectData | null> {
        // Get project info from any user (for shared projects)
        const projectRef = doc(db, "users", ownerId, "projects", sessionId);
        const snap = await getDoc(projectRef);
        if (!snap.exists()) return null;

        const data = snap.data() as ProjectData;
        return {
            ...data,
            createdDate: data.createdDate?.toDate?.() ?? new Date(),
            lastModified: data.lastModified?.toDate?.() ?? new Date(),
        };
    },

    async updateProjectFile(sessionId: string, fileUrl: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        await updateDoc(projectRef, {
            fileUrl,
            lastModified: serverTimestamp(),
        });
    },

    async updateProjectFileByOwner(sessionId: string, ownerId: string, fileUrl: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", ownerId, "projects", sessionId);
        await updateDoc(projectRef, {
            fileUrl,
            lastModified: serverTimestamp(),
        });
    },

    async updateProjectName(sessionId: string, newName: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        await updateDoc(projectRef, {
            projectName: newName,
            lastModified: serverTimestamp(),
        });
    },

    async updateProjectNameByOwner(sessionId: string, ownerId: string, newName: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", ownerId, "projects", sessionId);
        await updateDoc(projectRef, {
            projectName: newName,
            lastModified: serverTimestamp(),
        });
    },

    async toggleStarProject(sessionId: string, starred: boolean): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        await updateDoc(projectRef, {
            starred: starred,
            lastModified: serverTimestamp(),
        });
    },

    async getStarredProjects(): Promise<ProjectData[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectsRef = collection(db, "users", user.uid, "projects");
        const q = query(projectsRef, where("starred", "==", true));
        const snapshot = await getDocs(q);

        // Sort by lastModified on client side to avoid needing index
        const projects = snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as ProjectData;
            return {
                ...data,
                createdDate: data.createdDate?.toDate?.() ?? new Date(),
                lastModified: data.lastModified?.toDate?.() ?? new Date(),
            };
        });

        // Sort by lastModified descending
        return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    },

    async deleteProject(sessionId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const projectRef = doc(db, "users", user.uid, "projects", sessionId);
        await deleteDoc(projectRef);
    },
};

// ─── Project Collaborators Service ─────────────────────────────────────────

export const projectCollaboratorService = {
    async addCollaborator(
        sessionId: string,
        ownerId: string,
        userId: string,
        email: string,
        displayName: string,
        role: "owner" | "editor" | "viewer",
    ): Promise<void> {
        const collaboratorData: Omit<ProjectCollaborator, "addedAt"> & { addedAt: any } = {
            userId,
            email,
            displayName,
            role,
            addedAt: serverTimestamp(),
        };

        const collaboratorRef = doc(db, "users", ownerId, "projects", sessionId, "collaborators", userId);
        await setDoc(collaboratorRef, collaboratorData);

        // Update project's collaboratorIds array
        const projectRef = doc(db, "users", ownerId, "projects", sessionId);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
            const currentCollaborators = projectSnap.data().collaboratorIds || [];
            if (!currentCollaborators.includes(userId)) {
                await updateDoc(projectRef, {
                    collaboratorIds: [...currentCollaborators, userId],
                });
            }
        }
    },

    async getCollaborators(sessionId: string, ownerId: string): Promise<ProjectCollaborator[]> {
        const collaboratorsRef = collection(db, "users", ownerId, "projects", sessionId, "collaborators");
        const snapshot = await getDocs(collaboratorsRef);

        const collaborators = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                ...data,
                addedAt: data.addedAt?.toDate?.() ?? new Date(),
            } as ProjectCollaborator;
        });

        // Remove duplicates based on email (keep the most recent one)
        const uniqueCollaborators = new Map<string, ProjectCollaborator>();
        for (const collab of collaborators) {
            const existing = uniqueCollaborators.get(collab.email);
            if (!existing || collab.addedAt > existing.addedAt) {
                uniqueCollaborators.set(collab.email, collab);
            }
        }

        return Array.from(uniqueCollaborators.values());
    },

    async removeCollaborator(sessionId: string, ownerId: string, userId: string): Promise<void> {
        const collaboratorRef = doc(db, "users", ownerId, "projects", sessionId, "collaborators", userId);
        await deleteDoc(collaboratorRef);

        // Update project's collaboratorIds array
        const projectRef = doc(db, "users", ownerId, "projects", sessionId);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
            const currentCollaborators = projectSnap.data().collaboratorIds || [];
            await updateDoc(projectRef, {
                collaboratorIds: currentCollaborators.filter((id: string) => id !== userId),
            });
        }
    },

    async updateCollaboratorRole(
        sessionId: string,
        ownerId: string,
        userId: string,
        role: "owner" | "editor" | "viewer",
    ): Promise<void> {
        const collaboratorRef = doc(db, "users", ownerId, "projects", sessionId, "collaborators", userId);
        await updateDoc(collaboratorRef, { role });
    },
};

// ─── Project Change History Service ────────────────────────────────────────

export const projectHistoryService = {
    async addChange(
        sessionId: string,
        ownerId: string,
        action: "created" | "modified" | "renamed" | "shared" | "deleted",
        description: string,
        fileUrl?: string,
    ): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const changeData: Omit<ProjectChangeHistory, "id"> & { timestamp: any } = {
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.displayName || user.email?.split("@")[0] || "Unknown",
            action,
            description,
            timestamp: serverTimestamp(),
        };

        if (fileUrl) {
            changeData.fileUrl = fileUrl;
        }

        const historyRef = collection(db, "users", ownerId, "projects", sessionId, "history");
        await addDoc(historyRef, changeData);
    },

    async getHistory(sessionId: string, ownerId: string): Promise<ProjectChangeHistory[]> {
        const historyRef = collection(db, "users", ownerId, "projects", sessionId, "history");
        const q = query(historyRef, orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                ...data,
                timestamp: data.timestamp?.toDate?.() ?? new Date(),
            } as ProjectChangeHistory;
        });
    },

    async clearHistory(sessionId: string, ownerId: string): Promise<void> {
        const historyRef = collection(db, "users", ownerId, "projects", sessionId, "history");
        const snapshot = await getDocs(historyRef);

        const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
    },
};

export { analytics, auth, db };
export type { User };

// ─── Friends Service ────────────────────────────────────────────────────

export interface Friend {
    id: string;
    userId: string;
    friendId: string;
    friendEmail: string;
    friendName: string;
    status: "pending" | "accepted" | "rejected";
    requestedBy: string;
    createdAt: Date;
}

export interface FriendRequest {
    id: string;
    fromUserId: string;
    fromEmail: string;
    fromName: string;
    toUserId: string;
    toEmail: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: Date;
}

export const friendService = {
    async sendFriendRequest(toEmail: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(toEmail)) {
            throw new Error("Invalid email format");
        }

        // Don't allow sending request to yourself
        if (toEmail === user.email) {
            throw new Error("You cannot send a friend request to yourself");
        }

        // Check if request already exists (by email)
        const existingQuery = query(
            collection(db, "friendRequests"),
            where("fromUserId", "==", user.uid),
            where("toEmail", "==", toEmail),
        );
        const existing = await getDocs(existingQuery);

        if (!existing.empty) {
            throw new Error("Friend request already sent to this email");
        }

        // Check if already friends (by email)
        const friendsQuery = query(
            collection(db, "friends"),
            where("userId", "==", user.uid),
            where("friendEmail", "==", toEmail),
        );
        const friendsSnapshot = await getDocs(friendsQuery);

        if (!friendsSnapshot.empty) {
            throw new Error("Already friends with this user");
        }

        // Get current user's name
        const currentUserName = localStorage.getItem("username") || user.email?.split("@")[0] || "User";

        // Create friend request (we'll match by email when they log in)
        await addDoc(collection(db, "friendRequests"), {
            fromUserId: user.uid,
            fromEmail: user.email,
            fromName: currentUserName,
            toUserId: "", // Will be filled when recipient logs in
            toEmail: toEmail,
            status: "pending",
            createdAt: serverTimestamp(),
        });

        // Create a notification for the recipient (by email)
        await addDoc(collection(db, "notifications"), {
            userId: "", // Will be matched by email
            recipientEmail: toEmail,
            type: "friend_request",
            title: "New Friend Request",
            message: `${currentUserName} sent you a friend request`,
            read: false,
            createdAt: serverTimestamp(),
            metadata: {
                fromUserId: user.uid,
                fromEmail: user.email,
                fromName: currentUserName,
            },
        });
    },

    async getFriendRequests(): Promise<FriendRequest[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        console.log("Fetching friend requests for:", user.email);

        try {
            // Simplified query without orderBy to avoid index requirement
            const q = query(
                collection(db, "friendRequests"),
                where("toEmail", "==", user.email),
                where("status", "==", "pending"),
            );

            const snapshot = await getDocs(q);
            console.log("Found friend requests:", snapshot.size);

            // Update toUserId for requests that don't have it yet
            const updates: Promise<void>[] = [];
            snapshot.docs.forEach((doc) => {
                if (!doc.data().toUserId) {
                    updates.push(updateDoc(doc.ref, { toUserId: user.uid }));
                }
            });
            await Promise.all(updates);

            // Sort by createdAt on client side
            const requests = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
            })) as FriendRequest[];

            requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return requests;
        } catch (error) {
            console.error("Error fetching friend requests:", error);
            throw error;
        }
    },

    async acceptFriendRequest(requestId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        const requestDoc = await getDoc(doc(db, "friendRequests", requestId));
        if (!requestDoc.exists()) throw new Error("Request not found");

        const requestData = requestDoc.data();

        // Update request status
        await updateDoc(doc(db, "friendRequests", requestId), {
            status: "accepted",
        });

        // Add to friends collection for both users
        await addDoc(collection(db, "friends"), {
            userId: user.uid,
            friendId: requestData.fromUserId,
            friendEmail: requestData.fromEmail,
            friendName: requestData.fromName,
            status: "accepted",
            requestedBy: requestData.fromUserId,
            createdAt: serverTimestamp(),
        });

        await addDoc(collection(db, "friends"), {
            userId: requestData.fromUserId,
            friendId: user.uid,
            friendEmail: user.email,
            friendName: localStorage.getItem("username") || user.email?.split("@")[0] || "User",
            status: "accepted",
            requestedBy: requestData.fromUserId,
            createdAt: serverTimestamp(),
        });
    },

    async rejectFriendRequest(requestId: string): Promise<void> {
        await updateDoc(doc(db, "friendRequests", requestId), {
            status: "rejected",
        });
    },

    async getFriends(): Promise<Friend[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        try {
            // Simplified query without orderBy to avoid index requirement
            const q = query(
                collection(db, "friends"),
                where("userId", "==", user.uid),
                where("status", "==", "accepted"),
            );

            const snapshot = await getDocs(q);

            // Sort by createdAt on client side
            const friends = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
            })) as Friend[];

            friends.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return friends;
        } catch (error) {
            console.error("Error fetching friends:", error);
            throw error;
        }
    },

    async removeFriend(friendId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("Not authenticated");

        // Remove from both sides
        const q1 = query(
            collection(db, "friends"),
            where("userId", "==", user.uid),
            where("friendId", "==", friendId),
        );
        const snapshot1 = await getDocs(q1);
        for (const doc of snapshot1.docs) {
            await deleteDoc(doc.ref);
        }

        const q2 = query(
            collection(db, "friends"),
            where("userId", "==", friendId),
            where("friendId", "==", user.uid),
        );
        const snapshot2 = await getDocs(q2);
        for (const doc of snapshot2.docs) {
            await deleteDoc(doc.ref);
        }
    },
};
