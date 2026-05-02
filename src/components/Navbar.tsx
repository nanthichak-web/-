import { Link, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { Trophy, Shield, Home, LogOut } from 'lucide-react';
import { AuthContext } from '../App';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export default function Navbar() {
  const { isAdmin, setIsAdmin, user } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    setIsAdmin(false);
    navigate('/');
  };

  return (
    <nav className="bg-asphalt-800 border-b border-asphalt-700 px-6 py-4 sticky top-0 z-50 shadow-2xl">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="p-2 bg-racing-red rounded-lg group-hover:rotate-12 transition-transform">
            <Trophy className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter text-white leading-none">MINI4WD</h1>
            <p className="text-[10px] text-racing-red font-bold uppercase tracking-[0.2em]">ศูนย์รวมการแข่งขัน</p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <Link to="/" className="text-asphalt-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-bold uppercase tracking-wider">
            <Home size={18} />
            <span className="hidden sm:inline">หน้าแรก</span>
          </Link>
          
          {!isAdmin ? (
            <Link to="/admin" className="btn-racing-secondary text-xs">
              <Shield size={16} />
              ผู้ดูแลระบบ
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/admin" className="btn-racing-secondary text-[10px] py-1">
                <Shield size={14} className="text-racing-red" />
                แผงควบคุม
              </Link>
              <button 
                onClick={handleLogout}
                className="text-asphalt-400 hover:text-racing-red transition-colors flex items-center gap-1 text-sm font-bold uppercase tracking-wider"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
