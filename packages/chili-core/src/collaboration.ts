// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    type Unsubscribe,
    updateDoc,
    where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PermissionLevel = "viewer" | "commenter" | "editor" | "admin" | "owner";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface TeamMember {
    uid: string;
    email: string;
    displayName: string;
    role: PermissionLevel;
    joinedAt: any;
}

export interface Team {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    members: TeamMember[];
    projectIds: string[];
    createdAt: any;
    updatedAt: any;
}

export interface ProjectShare {
    projectId: string;
    sharedBy: string;
    sharedWith: string; // uid or email
    permission: PermissionLevel;
    sharedAt: any;
}

export interface ChatMessage {
    id?: string;
    userId: string;
    userEmail: string;
    displayName: string;
    message: string;
    timestamp: any;
    read: boolean;
}

export interface AccessRequest {
    id: string;
    projectId: string;
    requesterId: string;
    requesterEmail: string;
    requesterName: string;
    ownerId: string;
    requestedRole: PermissionLevel; // The role the user is requesting
    status: AccessRequestStatus;
    message?: string;
    requestedAt: any;
    respondedAt?: any;
}

export interface Comment {
    id: string;
    projectId: string;
    userId: string;
    userEmail: string;
    userName: string;
    content: string;
    position?: { x: number; y: number; z: number }; // 3D position
    resolved: boolean;
    createdAt: any;
    updatedAt: any;
    replies: CommentReply[];
}

export interface CommentReply {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    content: string;
    createdAt: any;
}

export interface UserPresence {
    uid: string;
    email: string;
    displayName: string;
    cursor?: { x: number; y: number; z: number };
    lastSeen: any;
    isActive: boolean;
}

export interface Notification {
    id: string;
    userId: string;
    type: "access_request" | "comment" | "mention" | "team_invite" | "project_shared";
    title: string;
    message: string;
    link?: string;
    read: boolean;
    createdAt: any;
}

// ─── Team Service ───────────────────────────────────────────────────────────

export const teamService = {
    async createTeam(name: string, description: string): Promise<Team> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const teamData = {
            name,
            description,
            ownerId: user.uid,
            members: [], // Empty array - we'll add members as subcollection
            projectIds: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const teamRef = await addDoc(collection(db, "teams"), teamData);

        // Add owner as first member in subcollection
        const ownerMemberData = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || user.email!.split("@")[0],
            role: "owner" as PermissionLevel,
            joinedAt: serverTimestamp(),
        };

        await setDoc(doc(db, "teams", teamRef.id, "members", user.uid), ownerMemberData);

        return {
            id: teamRef.id,
            ...teamData,
            members: [
                {
                    ...ownerMemberData,
                    joinedAt: new Date(),
                },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        } as Team;
    },

    async getMyTeams(): Promise<Team[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Get teams where user is a member (from subcollection)
        const teamsRef = collection(db, "teams");
        const snapshot = await getDocs(teamsRef);

        const teams: Team[] = [];

        for (const teamDoc of snapshot.docs) {
            // Check if user is a member
            const memberRef = doc(db, "teams", teamDoc.id, "members", user.uid);
            const memberSnap = await getDoc(memberRef);

            if (memberSnap.exists()) {
                // Load all members for this team
                const membersRef = collection(db, "teams", teamDoc.id, "members");
                const membersSnap = await getDocs(membersRef);

                const members = membersSnap.docs.map((memberDoc) => ({
                    ...memberDoc.data(),
                    joinedAt: memberDoc.data().joinedAt?.toDate?.() ?? new Date(),
                })) as TeamMember[];

                teams.push({
                    id: teamDoc.id,
                    ...teamDoc.data(),
                    members,
                } as Team);
            }
        }

        return teams;
    },

    async getTeam(teamId: string): Promise<Team | null> {
        const teamRef = doc(db, "teams", teamId);
        const snap = await getDoc(teamRef);
        if (!snap.exists()) return null;

        // Load members from subcollection
        const membersRef = collection(db, "teams", teamId, "members");
        const membersSnap = await getDocs(membersRef);

        const members = membersSnap.docs.map((memberDoc) => ({
            ...memberDoc.data(),
            joinedAt: memberDoc.data().joinedAt?.toDate?.() ?? new Date(),
        })) as TeamMember[];

        return {
            id: snap.id,
            ...snap.data(),
            members,
        } as Team;
    },

    async addMember(teamId: string, email: string, role: PermissionLevel): Promise<void> {
        const teamRef = doc(db, "teams", teamId);
        const team = await getDoc(teamRef);
        if (!team.exists()) throw new Error("Team not found");

        // Generate a temporary ID for the member (will be replaced when they accept)
        const tempMemberId = crypto.randomUUID();

        const memberData = {
            uid: tempMemberId,
            email,
            displayName: email.split("@")[0],
            role,
            joinedAt: serverTimestamp(),
        };

        // Add member to subcollection
        await setDoc(doc(db, "teams", teamId, "members", tempMemberId), memberData);

        await updateDoc(teamRef, {
            updatedAt: serverTimestamp(),
        });
    },

    async removeMember(teamId: string, memberUid: string): Promise<void> {
        const teamRef = doc(db, "teams", teamId);
        const team = await getDoc(teamRef);
        if (!team.exists()) throw new Error("Team not found");

        // Remove member from subcollection
        const memberRef = doc(db, "teams", teamId, "members", memberUid);
        await deleteDoc(memberRef);

        await updateDoc(teamRef, {
            updatedAt: serverTimestamp(),
        });
    },

    async assignProject(teamId: string, projectId: string): Promise<void> {
        const teamRef = doc(db, "teams", teamId);
        await updateDoc(teamRef, {
            projectIds: arrayUnion(projectId),
            updatedAt: serverTimestamp(),
        });
    },

    async addProjectToTeam(teamId: string, projectId: string): Promise<void> {
        const teamRef = doc(db, "teams", teamId);
        await updateDoc(teamRef, {
            projectIds: arrayUnion(projectId),
            updatedAt: serverTimestamp(),
        });
    },

    async inviteToTeam(teamId: string, email: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const teamRef = doc(db, "teams", teamId);
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists()) throw new Error("Team not found");

        const teamData = teamSnap.data();

        // Create team invitation
        await addDoc(collection(db, "teamInvitations"), {
            teamId,
            teamName: teamData.name,
            invitedBy: user.uid,
            invitedByEmail: user.email,
            invitedEmail: email,
            status: "pending",
            createdAt: serverTimestamp(),
        });

        // Create notification
        await addDoc(collection(db, "notifications"), {
            userId: "",
            recipientEmail: email,
            type: "team_invitation",
            title: "Team Invitation",
            message: `You've been invited to join the team "${teamData.name}"`,
            read: false,
            createdAt: serverTimestamp(),
            metadata: {
                teamId,
                teamName: teamData.name,
                invitedBy: user.email,
            },
        });
    },

    async unassignProject(teamId: string, projectId: string): Promise<void> {
        const teamRef = doc(db, "teams", teamId);
        await updateDoc(teamRef, {
            projectIds: arrayRemove(projectId),
            updatedAt: serverTimestamp(),
        });
    },

    async deleteTeam(teamId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const teamRef = doc(db, "teams", teamId);
        const team = await getDoc(teamRef);
        if (!team.exists()) throw new Error("Team not found");

        const teamData = team.data() as Team;
        if (teamData.ownerId !== user.uid) {
            throw new Error("Only team owner can delete the team");
        }

        await deleteDoc(teamRef);
    },
};

// ─── Share Service ──────────────────────────────────────────────────────────

export const shareService = {
    async shareProject(projectId: string, email: string, permission: PermissionLevel): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Get project info to include in invitation
        const { projectService, projectCollaboratorService } = await import("./firebase");
        const project = await projectService.getProject(projectId);
        if (!project) throw new Error("Project not found");

        // Ensure owner is added as collaborator (for old projects that don't have it)
        try {
            const collaborators = await projectCollaboratorService.getCollaborators(projectId, user.uid);
            const ownerExists = collaborators.some((c) => c.userId === user.uid);
            if (!ownerExists) {
                await projectCollaboratorService.addCollaborator(
                    projectId,
                    user.uid,
                    user.uid,
                    user.email!,
                    user.displayName || user.email!.split("@")[0],
                    "owner",
                );
            }
        } catch (error) {
            // If collaborators subcollection doesn't exist, add owner
            await projectCollaboratorService.addCollaborator(
                projectId,
                user.uid,
                user.uid,
                user.email!,
                user.displayName || user.email!.split("@")[0],
                "owner",
            );
        }

        // Create project invitation instead of immediate share
        await addDoc(collection(db, "projectInvitations"), {
            projectId,
            projectName: project.projectName,
            ownerId: user.uid,
            ownerEmail: user.email,
            invitedEmail: email,
            permission,
            status: "pending",
            createdAt: serverTimestamp(),
        });

        // Send notification by email (will be matched when user logs in)
        await addDoc(collection(db, "notifications"), {
            userId: "",
            recipientEmail: email,
            type: "project_invitation",
            title: "Project Invitation",
            message: `${user.email} invited you to collaborate on "${project.projectName}"`,
            read: false,
            createdAt: serverTimestamp(),
            metadata: {
                projectId,
                projectName: project.projectName,
                invitedBy: user.email,
            },
        });
    },

    async getSharedProjects(): Promise<ProjectShare[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const sharesRef = collection(db, "projectShares");
        const q = query(sharesRef, where("sharedWith", "==", user.email), where("status", "==", "accepted"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => doc.data()) as ProjectShare[];
    },

    async getProjectShares(projectId: string): Promise<ProjectShare[]> {
        const sharesRef = collection(db, "projectShares");
        const q = query(sharesRef, where("projectId", "==", projectId), where("status", "==", "accepted"));
        const snapshot = await getDocs(q);

        const shares = snapshot.docs.map(
            (doc) =>
                ({
                    id: doc.id,
                    ...doc.data(),
                }) as unknown as ProjectShare,
        );

        // Remove duplicates based on sharedWith email (keep the most recent one)
        const uniqueShares = new Map<string, ProjectShare>();
        for (const share of shares) {
            const existing = uniqueShares.get(share.sharedWith);
            const shareTime = share.sharedAt?.toMillis?.() || 0;
            const existingTime = existing?.sharedAt?.toMillis?.() || 0;

            if (!existing || shareTime > existingTime) {
                uniqueShares.set(share.sharedWith, share);
            }
        }

        return Array.from(uniqueShares.values());
    },

    async acceptProjectInvitation(invitationId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Get invitation details
        const invitationRef = doc(db, "projectInvitations", invitationId);
        const invitationSnap = await getDoc(invitationRef);
        if (!invitationSnap.exists()) throw new Error("Invitation not found");

        const invitation = invitationSnap.data();

        // Create the actual share with accepted status
        await addDoc(collection(db, "projectShares"), {
            projectId: invitation.projectId,
            sharedBy: invitation.ownerId,
            ownerEmail: invitation.ownerEmail, // Store owner email for display
            sharedWith: user.email,
            permission: invitation.permission,
            status: "accepted",
            sharedAt: serverTimestamp(),
        });

        // Add user as collaborator to the project
        const { projectCollaboratorService } = await import("./firebase");
        await projectCollaboratorService.addCollaborator(
            invitation.projectId,
            invitation.ownerId,
            user.uid,
            user.email!,
            user.displayName || user.email!.split("@")[0],
            invitation.permission === "admin" ? "owner" : "editor",
        );

        // Update invitation status
        await updateDoc(invitationRef, {
            status: "accepted",
            acceptedAt: serverTimestamp(),
        });
    },

    async rejectProjectInvitation(invitationId: string): Promise<void> {
        const invitationRef = doc(db, "projectInvitations", invitationId);
        await updateDoc(invitationRef, {
            status: "rejected",
            rejectedAt: serverTimestamp(),
        });
    },

    async getProjectInvitations(): Promise<any[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const invitationsRef = collection(db, "projectInvitations");
        const q = query(
            invitationsRef,
            where("invitedEmail", "==", user.email),
            where("status", "==", "pending"),
        );
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    },

    async updatePermission(projectId: string, email: string, permission: PermissionLevel): Promise<void> {
        const sharesRef = collection(db, "projectShares");
        const q = query(sharesRef, where("projectId", "==", projectId), where("sharedWith", "==", email));
        const snapshot = await getDocs(q);

        if (snapshot.empty) throw new Error("Share not found");

        const shareDoc = snapshot.docs[0];
        await updateDoc(shareDoc.ref, { permission });
    },

    async revokeAccess(projectId: string, email: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Remove from projectShares
        const sharesRef = collection(db, "projectShares");
        const q = query(sharesRef, where("projectId", "==", projectId), where("sharedWith", "==", email));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            await deleteDoc(snapshot.docs[0].ref);
        }

        // Get project to find owner
        const { projectService } = await import("./firebase");
        const project = await projectService.getProject(projectId);
        if (!project) return;

        // Remove from collaborators (need to find user by email)
        // This is a simplified version - in production you'd want to query users by email
        const { projectCollaboratorService } = await import("./firebase");
        const collaborators = await projectCollaboratorService.getCollaborators(projectId, project.userId);
        const collaborator = collaborators.find((c) => c.email === email);
        if (collaborator) {
            await projectCollaboratorService.removeCollaborator(
                projectId,
                project.userId,
                collaborator.userId,
            );
        }
    },

    async leaveProject(projectId: string, ownerId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Remove from projectShares
        const sharesRef = collection(db, "projectShares");
        const q = query(
            sharesRef,
            where("projectId", "==", projectId),
            where("sharedWith", "==", user.email),
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            await deleteDoc(snapshot.docs[0].ref);
        }

        // Remove from collaborators
        const { projectCollaboratorService } = await import("./firebase");
        await projectCollaboratorService.removeCollaborator(projectId, ownerId, user.uid);
    },
};

// ─── Access Request Service ─────────────────────────────────────────────────

export const accessRequestService = {
    async requestAccess(
        projectId: string,
        ownerId: string,
        requestedRole: PermissionLevel = "editor",
        message?: string,
    ): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        // Check for existing pending request from this user for this project
        const requestsRef = collection(db, "accessRequests");
        const existingRequestQuery = query(
            requestsRef,
            where("projectId", "==", projectId),
            where("requesterId", "==", user.uid),
            where("status", "==", "pending"),
        );
        const existingRequests = await getDocs(existingRequestQuery);

        if (!existingRequests.empty) {
            throw new Error("You already have a pending access request for this project");
        }

        const requestData: any = {
            projectId,
            requesterId: user.uid,
            requesterEmail: user.email!,
            requesterName: user.displayName || user.email!.split("@")[0],
            ownerId,
            requestedRole,
            status: "pending",
            requestedAt: serverTimestamp(),
        };

        // Only add message if it's provided (Firestore doesn't allow undefined)
        if (message) {
            requestData.message = message;
        }

        await addDoc(collection(db, "accessRequests"), requestData);

        // Send notification to owner
        await notificationService.create(ownerId, {
            type: "access_request",
            title: "Access Request",
            message: `${user.email} requested ${requestedRole} access to your project`,
            link: `/dashboard?tab=requests`,
        });
    },

    async getMyRequests(): Promise<AccessRequest[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const requestsRef = collection(db, "accessRequests");
        const q = query(requestsRef, where("ownerId", "==", user.uid), where("status", "==", "pending"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as AccessRequest[];
    },

    async approveRequest(requestId: string): Promise<void> {
        const requestRef = doc(db, "accessRequests", requestId);
        const request = await getDoc(requestRef);
        if (!request.exists()) throw new Error("Request not found");

        const requestData = request.data() as AccessRequest;

        try {
            // Add user as collaborator directly (they already requested access)
            console.log(`Adding requester as collaborator with ${requestData.requestedRole} role...`);
            const { projectCollaboratorService } = await import("./firebase");

            // Get project owner info
            const projectRef = doc(db, "projects", requestData.projectId);
            const projectSnap = await getDoc(projectRef);
            if (!projectSnap.exists()) throw new Error("Project not found");
            const projectData = projectSnap.data();
            const ownerId = projectData.userId;

            // Add collaborator to the project
            const collaboratorRole =
                requestData.requestedRole === "commenter" ? "viewer" : requestData.requestedRole;
            await projectCollaboratorService.addCollaborator(
                requestData.projectId,
                ownerId,
                requestData.requesterId,
                requestData.requesterEmail,
                requestData.requesterName,
                collaboratorRole as "owner" | "editor" | "viewer",
            );
            console.log("Collaborator added successfully");

            // Create project share record
            console.log("Creating project share record...");
            await addDoc(collection(db, "projectShares"), {
                projectId: requestData.projectId,
                sharedBy: ownerId,
                ownerEmail: projectData.userEmail || "",
                sharedWith: requestData.requesterEmail,
                permission: requestData.requestedRole,
                status: "accepted",
                sharedAt: serverTimestamp(),
            });
            console.log("Project share created successfully");

            // Update request status
            console.log("Updating request status...");
            await updateDoc(requestRef, {
                status: "approved",
                respondedAt: serverTimestamp(),
            });
            console.log("Request status updated");

            // Notify requester
            console.log("Sending notification to requester...");
            const roleLabel = requestData.requestedRole === "viewer" ? "Viewer" : "Editor";
            await notificationService.create(requestData.requesterId, {
                type: "access_request",
                title: "Access Granted",
                message: `Your access request has been approved as ${roleLabel}`,
                link: `/editor?sessionId=${requestData.projectId}`,
            });
            console.log("Notification sent successfully");
        } catch (error) {
            console.error("Error in approveRequest:", error);
            throw error;
        }
    },

    async rejectRequest(requestId: string): Promise<void> {
        const requestRef = doc(db, "accessRequests", requestId);
        await updateDoc(requestRef, {
            status: "rejected",
            respondedAt: serverTimestamp(),
        });
    },
};

// ─── Comment Service ────────────────────────────────────────────────────────

export const commentService = {
    async addComment(
        projectId: string,
        content: string,
        position?: { x: number; y: number; z: number },
    ): Promise<Comment> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const commentData = {
            projectId,
            userId: user.uid,
            userEmail: user.email!,
            userName: user.displayName || user.email!.split("@")[0],
            content,
            position,
            resolved: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            replies: [],
        };

        const commentRef = await addDoc(collection(db, "comments"), commentData);
        return { id: commentRef.id, ...commentData, createdAt: new Date(), updatedAt: new Date() } as Comment;
    },

    async getComments(projectId: string): Promise<Comment[]> {
        const commentsRef = collection(db, "comments");
        const q = query(commentsRef, where("projectId", "==", projectId), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Comment[];
    },

    async addReply(commentId: string, content: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const reply: CommentReply = {
            id: crypto.randomUUID(),
            userId: user.uid,
            userEmail: user.email!,
            userName: user.displayName || user.email!.split("@")[0],
            content,
            createdAt: serverTimestamp(),
        };

        const commentRef = doc(db, "comments", commentId);
        await updateDoc(commentRef, {
            replies: arrayUnion(reply),
            updatedAt: serverTimestamp(),
        });
    },

    async resolveComment(commentId: string): Promise<void> {
        const commentRef = doc(db, "comments", commentId);
        await updateDoc(commentRef, {
            resolved: true,
            updatedAt: serverTimestamp(),
        });
    },

    async deleteComment(commentId: string): Promise<void> {
        const commentRef = doc(db, "comments", commentId);
        await deleteDoc(commentRef);
    },

    subscribeToComments(projectId: string, callback: (comments: Comment[]) => void): Unsubscribe {
        const commentsRef = collection(db, "comments");
        const q = query(commentsRef, where("projectId", "==", projectId), orderBy("createdAt", "desc"));

        return onSnapshot(q, (snapshot) => {
            const comments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Comment[];
            callback(comments);
        });
    },
};

// ─── Presence Service ───────────────────────────────────────────────────────

export const presenceService = {
    async updatePresence(projectId: string, cursor?: { x: number; y: number; z: number }): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const presenceData: UserPresence = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || user.email!.split("@")[0],
            lastSeen: serverTimestamp(),
            isActive: true,
        };

        // Only add cursor if it's provided
        if (cursor) {
            presenceData.cursor = cursor;
        }

        const presenceRef = doc(db, "presence", projectId, "users", user.uid);
        await setDoc(presenceRef, presenceData, { merge: true });
    },

    async setInactive(projectId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) return;

        const presenceRef = doc(db, "presence", projectId, "users", user.uid);
        try {
            await setDoc(
                presenceRef,
                {
                    isActive: false,
                    lastSeen: serverTimestamp(),
                },
                { merge: true },
            );
        } catch (error) {
            // Ignore errors when setting inactive (document might not exist)
            console.warn("Failed to set presence inactive:", error);
        }
    },

    subscribeToPresence(projectId: string, callback: (users: UserPresence[]) => void): Unsubscribe {
        const presenceRef = collection(db, "presence", projectId, "users");

        return onSnapshot(presenceRef, (snapshot) => {
            const users = snapshot.docs
                .map((doc) => doc.data() as UserPresence)
                .filter((user) => user.isActive);
            callback(users);
        });
    },
};

// ─── Notification Service ───────────────────────────────────────────────────

export const notificationService = {
    async create(
        userId: string,
        notification: Omit<Notification, "id" | "userId" | "read" | "createdAt">,
    ): Promise<void> {
        const notificationData = {
            userId,
            ...notification,
            read: false,
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, "notifications"), notificationData);
    },

    async getMyNotifications(): Promise<Notification[]> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const notificationsRef = collection(db, "notifications");
        const q = query(notificationsRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Notification[];
    },

    async markAsRead(notificationId: string): Promise<void> {
        const notificationRef = doc(db, "notifications", notificationId);
        await updateDoc(notificationRef, { read: true });
    },

    async markAllAsRead(): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const notificationsRef = collection(db, "notifications");
        const q = query(notificationsRef, where("userId", "==", user.uid), where("read", "==", false));
        const snapshot = await getDocs(q);

        const updates = snapshot.docs.map((doc) => updateDoc(doc.ref, { read: true }));
        await Promise.all(updates);
    },

    subscribeToNotifications(callback: (notifications: Notification[]) => void): Unsubscribe {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const notificationsRef = collection(db, "notifications");
        const q = query(notificationsRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));

        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Notification[];
            callback(notifications);
        });
    },
};

// ─── Project Sync Service ───────────────────────────────────────────────────

export const projectSyncService = {
    /**
     * Subscribe to real-time project updates
     * When another user saves the project, this will trigger and reload the model
     */
    subscribeToProjectUpdates(
        sessionId: string,
        ownerId: string,
        callback: (fileUrl: string, lastModified: any) => void,
    ): Unsubscribe {
        const projectRef = doc(db, "users", ownerId, "projects", sessionId);

        return onSnapshot(projectRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.fileUrl && data.lastModified) {
                    callback(data.fileUrl, data.lastModified);
                }
            }
        });
    },
};

// ─── Chat Service ───────────────────────────────────────────────────────────

export const chatService = {
    async sendMessage(message: string, projectId: string): Promise<void> {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated");

        const chatMessage: Omit<ChatMessage, "id"> = {
            userId: user.uid,
            userEmail: user.email!,
            displayName: user.displayName || user.email!.split("@")[0],
            message,
            timestamp: serverTimestamp(),
            read: false,
        };

        // Store messages in project-specific subcollection
        await addDoc(collection(db, "projectChats", projectId, "messages"), chatMessage);
    },

    subscribeToMessages(projectId: string, callback: (messages: ChatMessage[]) => void): Unsubscribe {
        // Subscribe to project-specific messages
        const messagesRef = collection(db, "projectChats", projectId, "messages");
        const q = query(messagesRef, orderBy("timestamp", "desc"));

        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toDate?.() ?? new Date(),
                } as ChatMessage;
            });
            callback(messages);
        });
    },

    async markAsRead(projectId: string, messageId: string): Promise<void> {
        const messageRef = doc(db, "projectChats", projectId, "messages", messageId);
        await updateDoc(messageRef, { read: true });
    },

    async getUnreadCount(projectId: string): Promise<number> {
        const user = auth.currentUser;
        if (!user) return 0;

        const messagesRef = collection(db, "projectChats", projectId, "messages");
        const q = query(messagesRef, where("read", "==", false), where("userId", "!=", user.uid));
        const snapshot = await getDocs(q);

        return snapshot.size;
    },
};
