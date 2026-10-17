import { db } from './index.ts';
import { users, auditLogs } from './schema.ts';
import { eq, and, desc, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';

export async function getAllUsers() {
  try {
    const userList = await db.select().from(users).orderBy(desc(users.createdAt));
    return userList;
  } catch (error: any) {
    console.error("Failed to fetch user directory:", error);
    throw new Error("Gagal mengambil senarai pengguna.");
  }
}

export async function getOrCreateUser(uid: string, email: string, name: string) {
  try {
    // Check if user already exists
    const existingUsers = await db.select().from(users).where(eq(users.uid, uid));
    if (existingUsers.length > 0) {
      return existingUsers[0];
    }

    // Insert user with default role 'Admin'
    const newUsers = await db.insert(users)
      .values({
        uid,
        email,
        name: name || email.split('@')[0],
        role: 'Admin', // Default role is Admin
        isActive: true,
      })
      .returning();

    return newUsers[0];
  } catch (error) {
    console.error("Failed to synchronize user to database:", error);
    throw new Error("User synchronization failed", { cause: error });
  }
}

export async function updateUserRole(
  targetUid: string, 
  newRole: 'Admin' | 'Accountant' | 'Viewer', 
  adminUid: string
) {
  try {
    const targetUserList = await db.select().from(users).where(eq(users.uid, targetUid));
    if (targetUserList.length === 0) {
      throw new Error("Pengguna tidak ditemui.");
    }
    const targetUser = targetUserList[0];

    // Last admin protection guard
    if (targetUser.role === 'Admin' && newRole !== 'Admin') {
      const activeAdmins = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.role, 'Admin'), eq(users.isActive, true)));
      
      const adminCount = Number(activeAdmins[0]?.count || 0);
      if (adminCount <= 1) {
        throw new Error("Gagal Keselamatan: Akses Admin aktif terakhir tidak boleh ditukar peranan atau dialih keluar.");
      }
    }

    const updated = await db.update(users)
      .set({ role: newRole })
      .where(eq(users.uid, targetUid))
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      userId: adminUid,
      action: 'UPDATE_USER_ROLE',
      tableName: 'users',
      recordId: targetUid,
      oldValues: { role: targetUser.role },
      newValues: { role: newRole, email: targetUser.email },
    });

    return updated[0];
  } catch (error: any) {
    console.error("Failed to update user role:", error);
    throw new Error(error.message || "Gagal mengemas kini peranan pengguna.");
  }
}

export async function toggleUserStatus(
  targetUid: string, 
  isActive: boolean, 
  adminUid: string
) {
  try {
    if (targetUid === adminUid && !isActive) {
      throw new Error("Gagal Keselamatan: Anda tidak boleh menyahaktifkan akaun anda sendiri.");
    }

    const targetUserList = await db.select().from(users).where(eq(users.uid, targetUid));
    if (targetUserList.length === 0) {
      throw new Error("Pengguna tidak ditemui.");
    }
    const targetUser = targetUserList[0];

    // Last admin protection guard
    if (targetUser.role === 'Admin' && !isActive) {
      const activeAdmins = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.role, 'Admin'), eq(users.isActive, true)));
      
      const adminCount = Number(activeAdmins[0]?.count || 0);
      if (adminCount <= 1) {
        throw new Error("Gagal Keselamatan: Pentadbir (Admin) aktif terakhir tidak boleh dinyahaktifkan.");
      }
    }

    const updated = await db.update(users)
      .set({ isActive })
      .where(eq(users.uid, targetUid))
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      userId: adminUid,
      action: 'TOGGLE_USER_STATUS',
      tableName: 'users',
      recordId: targetUid,
      oldValues: { isActive: targetUser.isActive },
      newValues: { isActive, email: targetUser.email },
    });

    return updated[0];
  } catch (error: any) {
    console.error("Failed to toggle user status:", error);
    throw new Error(error.message || "Gagal menukar status pengguna.");
  }
}

export async function inviteOrRegisterUser(
  email: string, 
  name: string, 
  role: 'Admin' | 'Accountant' | 'Viewer', 
  adminUid: string
) {
  try {
    if (!email || !email.includes('@')) {
      throw new Error("Format e-mel tidak sah.");
    }

    let uid = '';
    // Check if user exists in Firebase Auth
    try {
      const fbUser = await adminAuth.getUserByEmail(email);
      uid = fbUser.uid;
    } catch (e) {
      // Create user in Firebase Auth with temporary generated password
      const tempPass = 'KhairulFresh' + Math.floor(100000 + Math.random() * 900000) + '!';
      const createdFb = await adminAuth.createUser({
        email,
        displayName: name,
        password: tempPass,
      });
      uid = createdFb.uid;
    }

    // Check if user exists in DB
    const existing = await db.select().from(users).where(eq(users.uid, uid));
    let dbRecord;

    if (existing.length > 0) {
      dbRecord = (await db.update(users)
        .set({ name: name || existing[0].name, role, isActive: true })
        .where(eq(users.uid, uid))
        .returning())[0];
    } else {
      dbRecord = (await db.insert(users)
        .values({
          uid,
          email,
          name: name || email.split('@')[0],
          role,
          isActive: true,
        })
        .returning())[0];
    }

    // Audit log
    await db.insert(auditLogs).values({
      userId: adminUid,
      action: 'INVITE_USER',
      tableName: 'users',
      recordId: uid,
      newValues: { email, name, role },
    });

    return dbRecord;
  } catch (error: any) {
    console.error("Failed to invite/register user:", error);
    throw new Error(error.message || "Gagal mendaftarkan pengguna.");
  }
}
