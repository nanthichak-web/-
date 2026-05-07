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

  const stagesRaw: number[] = [];
  rounds.forEach(r => {
    if (!stagesRaw.includes(r.stage)) stagesRaw.push(r.stage);
  });
  const stages = [...stagesRaw].sort((a, b) => b - a);

  // Calculate qualifying stats grouped by stage transition (from stage X to X+1)
  const stageTransitions = [...stagesRaw]
    .sort((a, b) => a - b)
    .reduce((acc: { from: number; to: number; players: [string, number][] }[], stage) => {
      const stageRounds = rounds.filter(r => r.stage === stage && r.isConfirmed);
      if (stageRounds.length === 0) return acc;

      const playerCounts: Record<string, number> = {};
      stageRounds.forEach(round => {
        round.slots.forEach(slot => {
          if (slot.result === '1' || slot.result === '2') {
            playerCounts[slot.playerName] = (playerCounts[slot.playerName] || 0) + 1;
          }
        });
      });

      if (Object.keys(playerCounts).length > 0) {
        acc.push({
          from: stage,
          to: stage + 1,
          players: Object.entries(playerCounts).sort((a, b) => b[1] - a[1])
        });
      }
      return acc;
    }, [] as { from: number; to: number; players: [string, number][] }[]);

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

      {/* Qualifying Stats Summary by Stage Transition */}
      {stageTransitions.length > 0 && (
        <div className="space-y-6">
           <div className="flex items-center gap-3">
              <Trophy size={24} className="text-racing-yellow" />
              <h3 className="text-xl font-black text-white italic tracking-tight uppercase">สรุปยอดรถที่เข้ารอบต่อไป</h3>
           </div>
           
           <div className="grid grid-cols-1 gap-6">
             {stageTransitions.map((transition) => (
               <div key={transition.from} className="bg-asphalt-800/40 rounded-xl border border-asphalt-700 overflow-hidden shadow-lg">
                  <div className="p-3 bg-asphalt-700/50 border-b border-asphalt-700 flex justify-between items-center px-6">
                    <span className="text-sm font-black text-racing-yellow uppercase italic tracking-widest">
                      จากรอบที่ {transition.from} เข้าสู่รอบที่ {transition.to}
                    </span>
                    <span className="text-[10px] text-asphalt-400 font-bold uppercase italic">ได้รับการจัดสรรเป็นคู่แข่งในรอบถัดไป</span>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {transition.players.map(([name, count]) => (
                        <div key={name} className="flex justify-between items-center bg-asphalt-900/60 p-4 rounded-lg border border-asphalt-700/50 group hover:border-racing-green/50 transition-all">
                          <div>
                            <p className="text-white font-black text-lg italic tracking-tight group-hover:text-racing-green transition-colors">{name}</p>
                            <p className="text-[9px] text-asphalt-500 font-black uppercase italic">ผ่านเข้ารอบ</p>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black text-racing-green italic">{count}</span>
                            <span className="text-[10px] text-asphalt-600 font-bold uppercase ml-1">คัน</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
               </div>
             ))}
           </div>
        </div>
      )}

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
                      
                      <div className="p-4 bg-asphalt-700/70 flex justify-between items-center text-sm font-black uppercase tracking-wider text-white italic">
                        <span className="flex items-center gap-2">
                          <Trophy size={14} className="text-racing-yellow" />
                          คู่ที่ {round.index}
                        </span>
                        {round.isConfirmed ? (
                          <span className="text-racing-green text-[10px] bg-racing-green/10 px-2 py-0.5 rounded border border-racing-green/30">ผลอย่างเป็นทางการ</span>
                        ) : round.isFinished ? (
                          <span className="text-racing-yellow text-[10px] border border-racing-yellow/30 px-2 py-0.5 rounded bg-racing-yellow/5">รอการยืนยัน</span>
                        ) : (
                          <span className="text-racing-yellow text-[10px] italic animate-pulse flex items-center gap-1">
                            <Clock size={10} />
                            กำลังแข่งขัน
                          </span>
                        )}
                      </div>

                      <div className="divide-y divide-asphalt-700/50">
                        {round.slots.map((slot, sIdx) => (
                          <div key={sIdx} className="p-5 flex justify-between items-center bg-asphalt-800/40 hover:bg-asphalt-800 transition-colors">
                            <div className="space-y-1">
                              <p className={cn(
                                "font-black text-xl tracking-tight italic",
                                slot.result === '1' && round.isConfirmed ? "text-racing-green" : "text-white"
                              )}>
                                {slot.playerName}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-asphalt-400 font-bold uppercase tracking-tighter">รถคันที่ {slot.carIndex}</p>
                                {slot.result === '1' && round.isConfirmed && (
                                  <span className="text-[10px] font-black text-racing-green uppercase italic flex items-center gap-0.5">
                                    <Award size={10} /> แชมป์สนาม
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {slot.result !== 'pending' && round.isConfirmed ? (
                              <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 font-black text-xl border-2 shadow-xl transform rotate-3",
                                slot.result === '1' ? "bg-racing-green border-racing-green/50 text-white shadow-racing-green/20" :
                                slot.result === '2' ? "bg-yellow-400 border-yellow-300 text-black shadow-yellow-400/20" :
                                slot.result === '3' ? "bg-racing-red border-racing-red/50 text-white shadow-racing-red/20" :
                                "bg-racing-red border-racing-red/50 text-white opacity-70"
                              )}>
                                {slot.result === 'DNF' ? 'D' : slot.result}
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg border-2 border-dashed border-asphalt-700 animate-pulse flex items-center justify-center bg-asphalt-900/50">
                                 {round.isFinished && !round.isConfirmed && <Clock size={16} className="text-racing-yellow" />}
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
