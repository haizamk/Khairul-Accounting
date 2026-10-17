import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: 'Admin' | 'Accountant' | 'Viewer';
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const email = decodedToken.email || '';
    const name = decodedToken.name || decodedToken.email?.split('@')[0] || 'User';

    // Fetch or create user record in Postgres to resolve role
    const dbUser = await getOrCreateUser(decodedToken.uid, email, name);

    if (dbUser.isActive === false) {
      return res.status(403).json({ error: 'Akaun anda telah dinyahaktifkan oleh Pentadbir.' });
    }

    req.user = {
      uid: dbUser.uid,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as 'Admin' | 'Accountant' | 'Viewer',
    };

    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
