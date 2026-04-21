import {type FormEvent, useEffect, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, User, Calendar, Mail, Loader2 } from 'lucide-react';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (!u) {
        navigate('/');
      } else {
        setUser(u);
        setDisplayName(u.displayName || '');
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [navigate]);

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');
    setErrorMsg('');
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, 'users', user.uid), { displayName });
      setMessage('Profile settings successfully updated.');
    } catch (error) {
      console.error(error);
      try {
        handleFirestoreError(error, 'update', `users/${user.uid}`);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to update profile. Check permissions.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12 md:py-20 max-w-4xl mx-auto">
      <button 
        onClick={() => navigate('/dashboard')} 
        className="mb-12 flex items-center gap-2 text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>
      
      <div className="liquid-glass rounded-3xl p-8 md:p-12 max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-serif tracking-tight mb-2">Profile Settings</h1>
        <p className="text-white/40 text-sm mb-10">Update your learning persona and review your account details.</p>
        
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="space-y-2">
            <label className="text-xs tracking-widest uppercase text-white/50 flex items-center gap-2">
              <User className="w-4 h-4" /> Display Name
            </label>
            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/30 transition-colors"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs tracking-widest uppercase text-white/50 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email Address
            </label>
            <input 
              type="email" 
              value={user.email || ''}
              disabled
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 outline-none cursor-not-allowed opacity-70"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs tracking-widest uppercase text-white/50 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Join Date
            </label>
            <input 
              type="text" 
              value={user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unknown'}
              disabled
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 outline-none cursor-not-allowed opacity-70"
            />
          </div>
          
          <div className="pt-4 mt-2 border-t border-white/10">
            <button 
              type="submit" 
              disabled={saving}
              className="w-full liquid-glass rounded-xl px-6 py-4 text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white/60" /> Save in progress...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>

          {message && (
            <div className="text-sm text-center text-green-400 bg-green-400/10 rounded-lg py-3 px-4">
              {message}
            </div>
          )}
          {errorMsg && (
            <div className="text-sm text-center text-red-400 bg-red-400/10 rounded-lg py-3 px-4">
              {errorMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
