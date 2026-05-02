import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import Home from './pages/Home';
import TournamentDetails from './pages/TournamentDetails';
import Admin from './pages/Admin';
import Referee from './pages/Referee';
import Navbar from './components/Navbar';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  setIsAdmin: () => {},
});

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('is_racing_admin') === 'true';
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      // Auto-detect admin by email
      if (u?.email?.toLowerCase() === 'nanthicha.k@ubu.ac.th') {
        setAdminStatus(true);
      }
      
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setAdminStatus = (status: boolean) => {
    setIsAdmin(status);
    localStorage.setItem('is_racing_admin', status ? 'true' : 'false');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-asphalt-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-racing-red"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, setIsAdmin: setAdminStatus }}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-grow container mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tournament/:id" element={<TournamentDetails />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/referee/:tournamentId" element={<Referee />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="py-6 text-center text-asphalt-600 text-sm border-t border-asphalt-800 mt-auto">
            © 2026 Mini4WD Tournament Management • UMC Racing Team
          </footer>
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
