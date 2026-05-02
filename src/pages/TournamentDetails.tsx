import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Tournament, Round } from '../types';
import { Trophy, Clock, Flag, Award, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function TournamentDetails() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsubT = onSnapshot(doc(db, 'tournaments', id), (s) => {
      if (s.exists()) setTournament({ id: s.id, ...s.data() } as Tournament);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${id}`);
    });

    const q = query(collection(db, 'tournaments', id, 'rounds'), orderBy('stage', 'desc'), orderBy('index', 'asc'));
    const unsubR = onSnapshot(q, (s) => {
      const allRounds = s.docs.map(d => ({ id: d.id, ...d.data() } as Round));
      // Only show published rounds to public
      setRounds(allRounds.filter(r => r.isPublished));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${id}/rounds`);
    });

    return () => { unsubT(); unsubR(); };
  }, [id]);

  if (loading) return <div className="text-center py-20 text-asphalt-500 font-bold uppercase tracking-widest animate-pulse">กำลังโหลดข้อมูลสนาม...</div>;
  if (!tournament) return <div className="text-center py-20 text-racing-red">ไม่พบรายการการแข่งขัน</div>;

  const stages = Array.from(new Set(rounds.map(r => r.stage))).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-10">
      {/* Header / Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-asphalt-800 border border-asphalt-700 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-racing-red/10 blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-racing-red text-white text-[10px] font-black uppercase italic rounded">ผลการแข่งขันล่าสุด</span>
              <span className="text-asphalt-400 text-[10px] font-bold uppercase tracking-widest">ประเภท {tournament.type}</span>
            </div>
            <h1 className="text-5xl font-black text-white italic tracking-tighter leading-none">{tournament.name}</h1>
            <p className="text-asphalt-400 font-medium">{tournament.date} • {tournament.totalParticipants} นักแข่ง • {tournament.totalCars} คัน</p>
          </div>

          {tournament.status === 'finished' && (
            <div className="flex flex-wrap gap-4 bg-asphalt-900/50 p-4 rounded-xl border border-asphalt-700">
               <div className="text-center px-4">
                  <p className="text-[10px] font-bold text-racing-yellow uppercase">อันดับ 1</p>
                  <p className="text-white font-black text-lg">{tournament.winner1 || '-'}</p>
               </div>
               <div className="text-center px-4 border-l border-asphalt-700">
                  <p className="text-[10px] font-bold text-asphalt-300 uppercase">อันดับ 2</p>
                  <p className="text-white font-black text-lg">{tournament.winner2 || '-'}</p>
               </div>
               <div className="text-center px-4 border-l border-asphalt-700">
                  <p className="text-[10px] font-bold text-orange-400 uppercase">อันดับ 3</p>
                  <p className="text-white font-black text-lg">{tournament.winner3 || '-'}</p>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Brackets / Rounds Section */}
      <div className="space-y-12">
        <AnimatePresence mode="popLayout">
          {stages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-asphalt-800/20 rounded-xl border-2 border-dashed border-asphalt-800"
            >
              <Clock size={48} className="text-asphalt-700 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-asphalt-500 italic">กำลังจัดลำดับการปล่อยตัว...</h3>
              <p className="text-asphalt-600 text-sm">กรรมการกำลังจัดตารางการแข่งขัน</p>
            </motion.div>
          ) : (
            stages.map((stage) => (
              <motion.div 
                key={stage}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black text-white italic tracking-tighter flex items-center gap-3">
                    <Flag className="text-racing-red" fill="currentColor" size={24} />
                    รอบที่ {stage}
                  </h3>
                  <div className="h-px bg-asphalt-800 flex-grow" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {rounds.filter(r => r.stage === stage).map((round) => (
                    <div key={round.id} className={cn(
                      "racing-card relative",
                      round.isFinished ? "opacity-75" : "scale-105 border-racing-red/30 shadow-racing-red/5 z-10"
                    )}>
                      {!round.isFinished && (
                        <div className="absolute -top-2 -right-2 px-2 py-1 bg-racing-red text-white text-[8px] font-black uppercase rounded animate-pulse shadow-lg ring-4 ring-asphalt-900">
                          ในขณะนี้
                        </div>
                      )}
                      
                      <div className="p-3 bg-asphalt-700/50 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-asphalt-400">
                        <span>คู่ที่ {round.index}</span>
                        {round.isConfirmed ? (
                          <span className="text-racing-green">ผลอย่างเป็นทางการ</span>
                        ) : round.isFinished ? (
                          <span className="text-racing-yellow border border-racing-yellow/30 px-1 py-0.5 rounded">รอการยืนยัน</span>
                        ) : (
                          <span className="text-racing-yellow italic">กำลังแข่งขัน</span>
                        )}
                      </div>

                      <div className="divide-y divide-asphalt-700/50">
                        {round.slots.map((slot, sIdx) => (
                          <div key={sIdx} className="p-4 flex justify-between items-center bg-asphalt-800/30">
                            <div>
                              <p className={cn(
                                "font-bold text-sm",
                                slot.result === '1' && round.isConfirmed ? "text-racing-yellow" : "text-white"
                              )}>
                                {slot.playerName}
                              </p>
                              <p className="text-[10px] text-asphalt-500 font-bold uppercase italic">รถคันที่ {slot.carIndex}</p>
                            </div>
                            
                            {slot.result !== 'pending' && round.isConfirmed ? (
                              <div className={cn(
                                "flex items-center justify-center w-8 h-8 rounded shrink-0 font-black text-sm border shadow-inner",
                                slot.result === '1' ? "bg-racing-yellow border-racing-yellow/50 text-black" :
                                slot.result === '2' ? "bg-slate-300 border-white/50 text-black" :
                                slot.result === '3' ? "bg-orange-700 border-orange-500/50 text-white" :
                                "bg-red-950 border-red-800/50 text-white opacity-50"
                              )}>
                                {slot.result === 'DNF' ? 'D' : slot.result}
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded border-2 border-dashed border-asphalt-700 animate-pulse flex items-center justify-center">
                                 {round.isFinished && !round.isConfirmed && <Clock size={12} className="text-racing-yellow" />}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
