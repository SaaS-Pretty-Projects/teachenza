import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import {getIdTokenResult} from 'firebase/auth';
import {Link} from 'react-router-dom';
import {ShieldAlert} from 'lucide-react';
import {auth} from '../lib/firebase';

interface RoleGateProps {
  requireAdmin?: boolean;
  requireTutor?: boolean;
  children: ReactNode;
}

export default function RoleGate({requireAdmin = false, requireTutor = false, children}: RoleGateProps) {
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClaims() {
      if (!user) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      try {
        const token = await getIdTokenResult(user, true);
        const isAdmin = token.claims.admin === true;
        const isTutor = token.claims.tutor === true || isAdmin;
        const nextAllowed = (!requireAdmin || isAdmin) && (!requireTutor || isTutor);

        if (!cancelled) {
          setAllowed(nextAllowed);
        }
      } catch (error) {
        console.error('Failed to read role claims', error);
        if (!cancelled) {
          setAllowed(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadClaims();

    return () => {
      cancelled = true;
    };
  }, [requireAdmin, requireTutor, user]);

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-white/70">Checking workspace access...</div>;
  }

  if (!allowed) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="liquid-glass rounded-[2rem] border border-white/10 max-w-lg w-full p-8 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto mb-4 text-amber-300" />
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-4">Restricted workspace</p>
          <h2 className="text-3xl font-serif mb-4">This area needs another role</h2>
          <p className="text-white/62 leading-relaxed mb-6">
            Ask an admin to refresh your Tutivex role if you should have access here.
          </p>
          <Link
            to="/dashboard"
            className="bg-white text-black rounded-full px-5 py-3 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
