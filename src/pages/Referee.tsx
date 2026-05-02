import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, collectionGroup, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Tournament, Round, RoundSlot, RoundResult } from '../types';
import { AuthContext } from '../App';
import { CheckCircle2, ChevronRight, Trophy, AlertTriangle, Play, Save, Edit2, LayoutDashboard, ArrowLeftRight, X, UserPlus, MoveRight } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Referee() {
  const { tournamentId } = useParams();
  const { isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentStage, setCurrentStage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sourcePlayer, setSourcePlayer] = useState<{ roundId: string, slotIndex: number, player: RoundSlot } | null>(null);

  useEffect(() => {
    if (!tournamentId) return;
    const unsubT = onSnapshot(doc(db, 'tournaments', tournamentId), (s) => {
      if (s.exists()) setTournament({ id: s.id, ...s.data() } as Tournament);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${tournamentId}`);
    });

    const q = query(
      collection(db, 'tournaments', tournamentId, 'rounds'),
      orderBy('stage', 'asc'),
      orderBy('index', 'asc')
    );
    const unsubR = onSnapshot(q, (s) => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() } as Round));
      setRounds(docs);
      
      // Determine max stage
      const maxStage = Math.max(...docs.map(r => r.stage), 1);
      setCurrentStage(maxStage);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${tournamentId}/rounds`);
    });

    return () => { unsubT(); unsubR(); };
  }, [tournamentId]);

  if (!isAdmin) {
    return (
      <div className="text-center py-20 bg-asphalt-800 rounded-lg border border-asphalt-700">
        <AlertTriangle size={48} className="text-racing-yellow mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white">การเข้าถึงถูกปฏิเสธ</h2>
        <p className="text-asphalt-500">เฉพาะกรรมการที่ได้รับอนุญาตเท่านั้นที่เข้าถึงโหมดนี้ได้</p>
        <button onClick={() => navigate('/admin')} className="btn-racing mt-6 inline-flex">ไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  const updateSlotResult = async (roundId: string, slotIndex: number, result: RoundResult) => {
    if (!tournamentId) return;
    const round = rounds.find(r => r.id === roundId);
    if (!round) return;

    const newSlots = [...round.slots];
    newSlots[slotIndex].result = result;

    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'rounds', roundId), {
        slots: newSlots
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/${roundId}`);
    }
  };

  const finishRound = async (roundId: string) => {
    if (!tournamentId) return;
    const round = rounds.find(r => r.id === roundId);
    if (!round) return;

    const results = round.slots.map(s => s.result);
    const ones = results.filter(r => r === '1').length;
    
    if (ones === 0) return alert('กรุณาระบุผู้ชนะอย่างน้อย 1 รายการ');

    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'rounds', roundId), {
        isFinished: true,
        isConfirmed: false // Reset confirmation when results are re-saved/re-opened
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/${roundId}`);
    }
  };

  const confirmRound = async (roundId: string) => {
    if (!tournamentId) return;
    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'rounds', roundId), {
        isConfirmed: true
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/${roundId}/confirm`);
    }
  };

  const publishRound = async (roundId: string) => {
    if (!tournamentId) return;
    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'rounds', roundId), {
        isPublished: true
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/${roundId}/publish`);
    }
  };

  const handePlayerSwap = async (targetRoundId: string, targetSlotIndex: number, targetPlayer: RoundSlot) => {
    if (!tournamentId || !sourcePlayer) return;

    try {
      const batch = writeBatch(db);
      
      // Get the rounds
      const sourceRound = rounds.find(r => r.id === sourcePlayer.roundId);
      const targetRound = rounds.find(r => r.id === targetRoundId);
      
      if (!sourceRound || !targetRound) return;

      const newSourceSlots = [...sourceRound.slots];
      
      if (sourcePlayer.roundId === targetRoundId) {
        // Swap within same round
        const temp = newSourceSlots[sourcePlayer.slotIndex];
        newSourceSlots[sourcePlayer.slotIndex] = newSourceSlots[targetSlotIndex];
        newSourceSlots[targetSlotIndex] = temp;
        
        batch.update(doc(db, 'tournaments', tournamentId, 'rounds', sourcePlayer.roundId), {
          slots: newSourceSlots
        });
      } else {
        // Swap between different rounds
        const newTargetSlots = [...targetRound.slots];
        
        newSourceSlots[sourcePlayer.slotIndex] = { ...targetPlayer };
        newTargetSlots[targetSlotIndex] = { ...sourcePlayer.player };
        
        batch.update(doc(db, 'tournaments', tournamentId, 'rounds', sourcePlayer.roundId), {
          slots: newSourceSlots
        });
        batch.update(doc(db, 'tournaments', tournamentId, 'rounds', targetRoundId), {
          slots: newTargetSlots
        });
      }

      await batch.commit();
      setSourcePlayer(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/swap`);
      alert("เกิดข้อผิดพลาดในการสลับตัวผู้เล่น");
    }
  };

  const handlePlayerMove = async (targetRoundId: string) => {
    if (!tournamentId || !sourcePlayer) return;
    if (sourcePlayer.roundId === targetRoundId) return;

    try {
      const batch = writeBatch(db);
      
      const sourceRound = rounds.find(r => r.id === sourcePlayer.roundId);
      const targetRound = rounds.find(r => r.id === targetRoundId);
      
      if (!sourceRound || !targetRound) return;

      const newSourceSlots = [...sourceRound.slots];
      const [movedPlayer] = newSourceSlots.splice(sourcePlayer.slotIndex, 1);
      
      const newTargetSlots = [...targetRound.slots, { ...movedPlayer, result: 'pending' as RoundResult }];
      
      batch.update(doc(db, 'tournaments', tournamentId, 'rounds', sourcePlayer.roundId), {
        slots: newSourceSlots
      });
      batch.update(doc(db, 'tournaments', tournamentId, 'rounds', targetRoundId), {
        slots: newTargetSlots
      });

      await batch.commit();
      setSourcePlayer(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rounds/move`);
      alert("เกิดข้อผิดพลาดในการย้ายผู้เล่น");
    }
  };

  const generateNextStage = async () => {
    if (!tournamentId || !tournament) return;
    
    // Check if all rounds in current stage are finished
    const stageRounds = rounds.filter(r => r.stage === currentStage);
    const allConfirmed = stageRounds.every(r => r.isFinished && r.isConfirmed);
    
    if (!allConfirmed) return alert('ไม่สามารถดำเนินการต่อได้: ยังไม่ได้ยืนยันผลการแข่งขันครบถ้วนในรอบนี้');

    // Collect winners (1st and 2nd)
    const advancers: any[] = [];
    stageRounds.forEach(r => {
      r.slots.forEach(s => {
        if (s.result === '1' || s.result === '2') {
          advancers.push({
            participantId: s.participantId,
            playerName: s.playerName,
            carIndex: s.carIndex,
            result: 'pending'
          });
        }
      });
    });

    if (advancers.length === 0) return alert('ไม่พบผู้ผ่านเข้ารอบ');

    const batch = writeBatch(db);
    const nextStage = currentStage + 1;

    // Check if this is the final final (only 1-3 cars left)
    if (advancers.length <= 3) {
      // Final round
      const newRef = doc(collection(db, 'tournaments', tournamentId, 'rounds'));
      batch.set(newRef, {
        stage: nextStage,
        index: 1,
        slots: advancers,
        isFinished: false,
        isPublished: false,
        isConfirmed: false,
        createdAt: serverTimestamp()
      });
    } else {
      // Shuffle and interleave for next stage
      const shuffled = advancers.sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i += 3) {
        const slots = shuffled.slice(i, i + 3);
        const newRef = doc(collection(db, 'tournaments', tournamentId, 'rounds'));
        batch.set(newRef, {
          stage: nextStage,
          index: Math.floor(i / 3) + 1,
          slots,
          isFinished: false,
          isPublished: false,
          isConfirmed: false,
          createdAt: serverTimestamp()
        });
      }
    }

    await batch.commit();
    alert(`สร้างรอบการแข่งขันที่ ${nextStage} สำเร็จ!`);
  };

  const finishTournament = async () => {
    if (!tournamentId) return;
    const lastRound = rounds[rounds.length - 1];
    if (!lastRound.isFinished) return alert('ต้องเสร็จสิ้นการแข่งขันรอบชิงชนะเลิศก่อน');

    const w1 = lastRound.slots.find(s => s.result === '1')?.playerName;
    const w2 = lastRound.slots.find(s => s.result === '2')?.playerName;
    const w3 = lastRound.slots.find(s => s.result === '3')?.playerName;

    await updateDoc(doc(db, 'tournaments', tournamentId), {
      status: 'finished',
      winner1: w1 || '',
      winner2: w2 || '',
      winner3: w3 || '',
    });
    alert('การแข่งขันเสร็จสิ้น!');
    navigate('/');
  };

  const currentStageRounds = rounds.filter(r => r.stage === currentStage);
  const isStageComplete = currentStageRounds.length > 0 && currentStageRounds.every(r => r.isFinished && r.isConfirmed);

  if (loading) return <div className="text-center font-bold animate-pulse text-racing-red">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="space-y-6 pb-20">
      {/* Referee Topbar */}
      <div className="sticky top-0 z-30 bg-asphalt-900/80 backdrop-blur-md border-b border-asphalt-800 py-4 mb-4 -mx-4 px-4 sm:-mx-8 sm:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button 
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-asphalt-400 hover:text-white bg-asphalt-800 transition-all font-black italic tracking-tighter uppercase"
          >
            <LayoutDashboard size={20} />
            <span className="text-xl">แผงควบคุม</span>
          </button>

          <div className="flex gap-3 w-full sm:w-auto">
            {isStageComplete && (
              currentStageRounds.length === 1 && currentStageRounds[0].slots.length <= 3 ? (
                <button onClick={finishTournament} className="btn-racing bg-racing-green text-black w-full sm:w-auto">
                  <Trophy size={18} />
                  สรุปผลการแข่งขัน
                </button>
              ) : (
                <button onClick={generateNextStage} className="btn-racing w-full sm:w-auto">
                  <ChevronRight size={18} />
                  รอบถัดไป
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-asphalt-800 p-6 rounded-lg border-l-4 border-racing-red shadow-xl">
        <div>
          <span className="text-[10px] font-black bg-racing-red text-white px-2 py-0.5 rounded uppercase italic">โหมดกรรมการ</span>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{tournament?.name}</h2>
          <div className="flex items-center gap-4 mt-1">
             <div className="flex items-center gap-1 text-racing-red font-bold text-sm">
                <Play size={14} fill="currentColor" /> รอบที่ {currentStage}
             </div>
             <div className="text-asphalt-500 text-xs font-bold uppercase tracking-widest">
                {currentStageRounds.length} คู่แข่งขันในรอบนี้
             </div>
          </div>
        </div>

        {sourcePlayer && (
          <div className="hidden lg:flex items-center gap-4 bg-racing-red/10 px-4 py-2 rounded-lg border border-racing-red/20 animate-pulse">
            <div className="flex flex-col">
              <span className="text-[10px] text-racing-red font-black uppercase italic leading-none mb-1">กำลังรอสลับตัว</span>
              <span className="text-white font-bold text-sm">{sourcePlayer.player.playerName}</span>
            </div>
            <button 
              onClick={() => setSourcePlayer(null)}
              className="p-1 hover:bg-racing-red/20 rounded transition-colors"
            >
              <X size={16} className="text-racing-red" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentStageRounds.map((round) => (
            <div key={round.id} className={cn(
            "racing-card transition-all",
            round.isFinished ? "opacity-60 border-racing-green/20" : 
            round.isPublished ? "border-asphalt-700" : "border-racing-yellow/30 shadow-lg shadow-racing-yellow/5"
          )}>
            <div className="p-4 bg-asphalt-700/50 flex justify-between items-center border-b border-asphalt-700">
              <h4 className="font-bold text-white flex items-center gap-2 italic">
                คู่ที่ {round.index}
                <span className="text-[10px] bg-asphalt-800 px-1.5 py-0.5 rounded text-asphalt-400 not-italic">
                  {round.slots.length} คัน
                </span>
                {!round.isPublished && (
                  <span className="text-[8px] bg-racing-yellow text-black px-1 rounded font-black uppercase shadow-sm">
                    ร่างตาราง
                  </span>
                )}
              </h4>
              {round.isFinished ? (
                <span className="text-[10px] text-racing-green font-bold uppercase flex items-center gap-1">
                  <CheckCircle2 size={12} /> เสร็จสิ้น
                </span>
              ) : (
                <span className="text-[10px] text-racing-yellow font-bold uppercase">กำลังดำเนินการ</span>
              )}
            </div>
            
            <div className="p-4 space-y-4">
              {round.slots.map((slot, sIdx) => {
                const isSource = sourcePlayer?.roundId === round.id && sourcePlayer?.slotIndex === sIdx;
                
                return (
                  <div key={sIdx} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div 
                        className={cn(
                          "transition-all cursor-pointer group relative p-2 -m-2 rounded-lg flex-1 mr-4",
                          isSource ? "bg-racing-red/20 border border-racing-red/30 scale-105" : "hover:bg-asphalt-700/50"
                        )}
                         onClick={() => {
                          if (round.isPublished || round.isFinished) return;
                          if (!sourcePlayer) {
                            setSourcePlayer({ roundId: round.id, slotIndex: sIdx, player: slot });
                          } else if (isSource) {
                            setSourcePlayer(null);
                          } else {
                            handePlayerSwap(round.id, sIdx, slot);
                          }
                        }}
                      >
                        <p className="font-bold text-white text-sm leading-none flex items-center gap-2">
                          {slot.playerName}
                          {!round.isFinished && !round.isPublished && (
                            <ArrowLeftRight 
                              size={12} 
                              className={cn(
                                "transition-opacity",
                                isSource ? "opacity-100 text-racing-red" : "opacity-0 group-hover:opacity-100 text-asphalt-500"
                              )} 
                            />
                          )}
                        </p>
                        <p className="text-[10px] text-asphalt-500 font-bold uppercase">รถคันที่ {slot.carIndex}</p>
                        
                        {!round.isFinished && !round.isPublished && !sourcePlayer && (
                           <div className="absolute left-0 -top-6 bg-black text-[9px] text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity font-bold whitespace-nowrap z-10 pointer-events-none border border-asphalt-700">
                              คลิกเพื่อเลือก (สลับ/ย้าย)
                           </div>
                        )}
                      </div>
                      {round.isPublished ? (
                        <div className="flex gap-1">
                          {!round.isFinished ? (
                            (['1', '2', '3', 'DNF'] as RoundResult[]).map((res) => (
                              <button
                                key={res}
                                onClick={() => updateSlotResult(round.id, sIdx, res)}
                                className={cn(
                                  "w-8 h-8 rounded text-[10px] font-black transition-all border flex items-center justify-center",
                                  slot.result === res 
                                    ? (res === '1' ? "bg-racing-yellow border-racing-yellow text-black scale-110 shadow-lg shadow-racing-yellow/20" :
                                       res === '2' ? "bg-white border-white text-black scale-110" :
                                       res === '3' ? "bg-orange-600 border-orange-600 text-white scale-110" :
                                       "bg-red-600 border-red-600 text-white scale-110")
                                    : "bg-asphalt-900 border-asphalt-700 text-asphalt-500 hover:border-asphalt-500"
                                )}
                              >
                                {res === 'DNF' ? 'D' : res}
                              </button>
                            ))
                          ) : (
                            <div className="flex flex-col items-end gap-2">
                              <span className={cn(
                                "text-[10px] font-black px-2 py-1 rounded uppercase min-w-[2rem] text-center",
                                slot.result === '1' ? "bg-racing-yellow text-black" :
                                slot.result === '2' ? "bg-white/90 text-black" :
                                slot.result === '3' ? "bg-orange-600 text-white" : "bg-red-900 text-white"
                              )}>
                                {slot.result}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[8px] font-bold text-asphalt-600 uppercase bg-asphalt-800 px-2 py-1 rounded border border-asphalt-700">
                          รอยืนยันตาราง
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {sourcePlayer && sourcePlayer.roundId !== round.id && !round.isPublished && !round.isFinished && round.slots.length < 12 && (
                <button 
                  onClick={() => handlePlayerMove(round.id)}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-racing-green/10 hover:bg-racing-green/20 border border-dashed border-racing-green/30 rounded-lg text-racing-green text-xs font-black uppercase tracking-tighter transition-all animate-pulse"
                >
                  <UserPlus size={16} />
                  ย้ายผู้เล่นมาร่วมแข่งคู่นี้
                </button>
              )}
              
              {!round.isPublished ? (
                <button 
                  onClick={() => publishRound(round.id)}
                  className="w-full btn-racing bg-racing-yellow text-black py-2 text-xs"
                >
                  <CheckCircle2 size={16} />
                  ยืนยันตารางแข่ง (ส่งไปหน้าแรก)
                </button>
              ) : !round.isFinished ? (
                <div className="space-y-2">
                  <button 
                    onClick={() => finishRound(round.id)}
                    className="w-full btn-racing bg-racing-red text-white py-1 text-[10px]"
                  >
                    บันทึกผลการแข่งขัน
                  </button>
                  <button 
                    onClick={() => updateDoc(doc(db, 'tournaments', tournamentId!, 'rounds', round.id), { isPublished: false })}
                    className="w-full py-1 text-[8px] font-bold text-asphalt-500 hover:text-white transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit2 size={10} />
                    แก้ไขตารางการแข่ง (ยกเลิกการประกาศ)
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {!round.isConfirmed && (
                    <button 
                      onClick={() => confirmRound(round.id)}
                      className="w-full btn-racing bg-racing-green text-black py-1 text-[10px]"
                    >
                      <CheckCircle2 size={12} />
                      ยืนยันผล (แสดงหน้าแรก)
                    </button>
                  )}
                  {tournament?.status !== 'finished' && (
                    <button 
                      onClick={() => updateDoc(doc(db, 'tournaments', tournamentId!, 'rounds', round.id), { isFinished: false, isConfirmed: false })}
                      className="w-full py-1 text-[10px] font-bold text-asphalt-500 hover:text-white transition-colors flex items-center justify-center gap-1 border border-asphalt-700 rounded"
                    >
                      <Edit2 size={12} />
                      แก้ไขผล
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
