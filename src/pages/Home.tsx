import { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Tournament } from '../types';
import { Link } from 'react-router-dom';
import { Calendar, Users, Car, ChevronRight, Trophy, LayoutDashboard } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { AuthContext } from '../App';

export default function Home() {
  const { isAdmin } = useContext(AuthContext);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'tournaments'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
      setTournaments(docs);
      setLoading(false);
    }, (error) => {
       console.error("Home Snapshot Error", error);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-racing-red"></div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-white italic tracking-tighter">รายการการแข่งขัน</h2>
          <p className="text-asphalt-400 font-medium">ตารางการแข่งขัน Mini4WD อย่างเป็นทางการ</p>
        </div>
        
        {isAdmin && (
          <Link 
            to="/admin" 
            className="btn-racing bg-racing-yellow text-black hover:bg-white flex items-center justify-center gap-2 self-start md:self-auto"
          >
            <LayoutDashboard size={18} />
            กลับไปยังแผงควบคุม Admin
          </Link>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="racing-card p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-asphalt-700 rounded-full flex items-center justify-center text-asphalt-500">
            <Trophy size={32} />
          </div>
          <p className="text-asphalt-400">ยังไม่มีการกำหนดการแข่งขัน</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              key={t.id}
            >
              <Link to={`/tournament/${t.id}`} className="racing-card group block relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-racing-red scale-y-0 group-hover:scale-y-100 transition-transform origin-top" />
                
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-1 bg-racing-red/10 text-racing-red text-[10px] font-bold uppercase rounded border border-racing-red/20 leading-none">
                      {t.type}
                    </span>
                    {t.status === 'finished' && (
                      <span className="px-2 py-1 bg-racing-green/10 text-racing-green text-[10px] font-bold uppercase rounded border border-racing-green/20 leading-none">
                        เสร็จสิ้น
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white group-hover:text-racing-red transition-colors capitalize">
                      {t.name}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-asphalt-700">
                    <div className="flex items-center gap-2 text-asphalt-400">
                      <Calendar size={14} className="text-racing-red" />
                      <span className="text-xs font-bold uppercase tracking-wider">{format(new Date(t.date), 'dd MMM yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-asphalt-400">
                      <Users size={14} className="text-racing-red" />
                      <span className="text-xs font-bold">{t.totalParticipants || 0} นักแข่ง</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between group-hover:pl-2 transition-all">
                    <div className="flex items-center gap-2 text-asphalt-400">
                      <Car size={14} className="text-racing-red" />
                      <span className="text-xs font-bold">{t.totalCars || 0} รถทั้งหมด</span>
                    </div>
                    <ChevronRight size={18} className="text-asphalt-600 group-hover:text-racing-red transform group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
