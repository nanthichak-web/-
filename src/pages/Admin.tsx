import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { Shield, Plus, Edit2, Trash2, Users, Play, LogOut, CheckCircle2, RotateCcw, LogIn, LayoutDashboard, ArrowLeftRight, Trophy } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, getDocs, writeBatch, serverTimestamp, deleteDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, loginWithGoogle, loginAnonymously } from '../lib/firebase';
import { Tournament, Participant, TournamentType, Round, RoundSlot } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin, setIsAdmin, user } = useContext(AuthContext);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [tournamentToDelete, setTournamentToDelete] = useState<{id: string, name: string} | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<TournamentType>('Opb');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin || !user) return;
    const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedTournaments = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      setTournaments(updatedTournaments);
      
      // Keep selectedTournament in sync with real-time updates
      if (selectedTournament) {
        const updatedSelected = updatedTournaments.find(t => t.id === selectedTournament.id);
        if (updatedSelected) {
          setSelectedTournament(updatedSelected);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tournaments');
    });
    return () => unsubscribe();
  }, [isAdmin, user, selectedTournament?.id]);

  useEffect(() => {
    if (!selectedTournament || !user) return;
    const q = query(collection(db, 'tournaments', selectedTournament.id, 'participants'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Participant)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${selectedTournament.id}/participants`);
    });
    return () => unsubscribe();
  }, [selectedTournament, user]);

  useEffect(() => {
    if (!selectedTournament || !user) return;
    const q = query(collection(db, 'tournaments', selectedTournament.id, 'rounds'), orderBy('stage', 'asc'), orderBy('index', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRounds(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Round)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${selectedTournament.id}/rounds`);
    });
    return () => unsubscribe();
  }, [selectedTournament, user]);

  const getTournamentStats = () => {
    if (!rounds.length) return null;
    
    const latestStage = Math.max(...rounds.map(r => r.stage));
    const stageRounds = rounds.filter(r => r.stage === latestStage);
    const allFinished = stageRounds.every(r => r.isFinished);
    const allConfirmed = stageRounds.every(r => r.isConfirmed);
    
    // Players who qualified from this stage (Result '1')
    const qualifiedSlots = stageRounds
      .filter(r => r.isConfirmed)
      .flatMap(r => r.slots)
      .filter(s => s.result === '1');

    const qualifiedCars = qualifiedSlots.length;
    
    // Group by participant
    const participantsMap = new Map<string, { name: string, carCount: number }>();
    qualifiedSlots.forEach(slot => {
      const existing = participantsMap.get(slot.participantId);
      if (existing) {
        existing.carCount += 1;
      } else {
        participantsMap.set(slot.participantId, { name: slot.playerName, carCount: 1 });
      }
    });

    const qualifiedList = Array.from(participantsMap.values()).sort((a, b) => b.carCount - a.carCount);

    return {
      latestStage,
      allFinished,
      allConfirmed,
      qualifiedCars,
      qualifiedList
    };
  };

  const getStageTransitions = () => {
    const stagesRaw: number[] = [];
    rounds.forEach(r => {
      if (!stagesRaw.includes(r.stage)) stagesRaw.push(r.stage);
    });

    return stagesRaw
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
      }, []);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'umc2026') {
      try {
        await loginAnonymously();
        setIsAdmin(true);
        setError('');
      } catch (err: any) {
        console.error("Anonymous login failed", err);
        if (err.code === 'auth/admin-restricted-operation') {
          setError("ระบบ 'Anonymous Auth' ยังไม่ได้เปิดใช้งานใน Firebase Console กรุณาแจ้งผู้ดูแลระบบให้เปิดใช้งาน หรือใช้ Google Login แทน");
        } else {
          setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        }
      }
    } else {
      setError('รหัสเข้าใช้งานไม่ถูกต้อง');
    }
  };

  const addTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'tournaments'), {
        name,
        type,
        date,
        status: 'registration',
        totalParticipants: 0,
        totalCars: 0,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
      setName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tournaments');
    }
  };

  const deleteTournament = async () => {
    if (!tournamentToDelete) return;
    const { id, name } = tournamentToDelete;

    try {
      console.log("Starting recursive deletion for tournament:", id);
      const batch = writeBatch(db);

      // 1. Fetch and delete participants subcollection
      const participantsSnap = await getDocs(collection(db, 'tournaments', id, 'participants'));
      console.log(`Found ${participantsSnap.size} participants to delete`);
      participantsSnap.forEach(pDoc => {
        batch.delete(pDoc.ref);
      });

      // 2. Fetch and delete rounds subcollection
      const roundsSnap = await getDocs(collection(db, 'tournaments', id, 'rounds'));
      console.log(`Found ${roundsSnap.size} rounds to delete`);
      roundsSnap.forEach(rDoc => {
        batch.delete(rDoc.ref);
      });

      // 3. Delete the main tournament document
      batch.delete(doc(db, 'tournaments', id));

      // 4. Commit all deletions
      await batch.commit();
      console.log("Batch deletion committed successfully");
      
      if (selectedTournament?.id === id) {
        setSelectedTournament(null);
      }
      
      alert("ลบรายการการแข่งขันและข้อมูลทั้งหมดเรียบร้อยแล้ว");
      setTournamentToDelete(null);
    } catch (err: any) {
      console.error("Recursive delete failed detailed error:", err);
      if (err.message?.includes('permission-denied') || err.code === 'permission-denied') {
        alert("คุณไม่มีสิทธิ์ในการลบรายการนี้ กรุณาตรวจสอบการเข้าสู่ระบบเบื้องหลัง");
      } else {
        alert("เกิดข้อผิดพลาดในการลบ: " + (err.message || "Unknown error"));
      }
      handleFirestoreError(err, OperationType.DELETE, `tournaments/${id}`);
      setTournamentToDelete(null);
    }
  };

  const deleteParticipant = async () => {
    if (!selectedTournament || !participantToDelete) return;
    const pId = participantToDelete.id;

    try {
      await deleteDoc(doc(db, 'tournaments', selectedTournament.id, 'participants', pId));
      
      // Update tournament totals
      const newTotalParticipants = Math.max(0, selectedTournament.totalParticipants - 1);
      const newTotalCars = Math.max(0, selectedTournament.totalCars - participantToDelete.carCount);
      
      await updateDoc(doc(db, 'tournaments', selectedTournament.id), {
        totalParticipants: newTotalParticipants,
        totalCars: newTotalCars
      });
      
      alert("ลบผู้สมัครสำเร็จ");
      setParticipantToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `participants/${pId}`);
      setParticipantToDelete(null);
    }
  };

  const addParticipant = async (pName: string, carCount: number) => {
    if (!selectedTournament) return;
    try {
      await addDoc(collection(db, 'tournaments', selectedTournament.id, 'participants'), {
        name: pName,
        carCount: carCount,
        createdAt: serverTimestamp()
      });
      // Update tournament totals
      const newTotalParticipants = participants.length + 1;
      const newTotalCars = participants.reduce((acc, p) => acc + p.carCount, 0) + carCount;
      await updateDoc(doc(db, 'tournaments', selectedTournament.id), {
        totalParticipants: newTotalParticipants,
        totalCars: newTotalCars
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tournaments/${selectedTournament.id}/participants`);
    }
  };

  const updateCarCount = async (participantId: string, delta: number) => {
    if (!selectedTournament) return;
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return;

    const newCount = Math.max(1, participant.carCount + delta);
    if (newCount === participant.carCount) return;

    try {
      await updateDoc(doc(db, 'tournaments', selectedTournament.id, 'participants', participantId), {
        carCount: newCount
      });

      // Update tournament total cars
      const newTotalCars = selectedTournament.totalCars + (newCount - participant.carCount);
      await updateDoc(doc(db, 'tournaments', selectedTournament.id), {
        totalCars: newTotalCars
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `participants/${participantId}`);
    }
  };

  const generateRounds = async () => {
    if (!selectedTournament) return;
    if (participants.length === 0) return alert('ยังไม่มีผู้สมัคร');

    try {
      const batch = writeBatch(db);
      
      // 1. Flatten into a list of all cars: { playerName, participantId, carIndex }
      let allCars: any[] = [];
      participants.forEach(p => {
        for (let i = 0; i < p.carCount; i++) {
          allCars.push({
            playerName: p.name,
            participantId: p.id,
            carIndex: i + 1
          });
        }
      });

      // 2. Shuffle algorithm considering "round-on-round-off" and "no same player in round"
      // Basic strategy: Group cars by player, then spread them out.
      const carsByPlayer: { [id: string]: any[] } = {};
      participants.forEach(p => {
        carsByPlayer[p.id] = allCars.filter(c => c.participantId === p.id);
      });

      // Simple Interleaving for round-on-round-off
      const interleaved: any[] = [];
      let playerIds = Object.keys(carsByPlayer).sort(() => Math.random() - 0.5);
      let maxCars = Math.max(...Object.values(carsByPlayer).map(c => c.length));

      for (let i = 0; i < maxCars; i++) {
        // Shuffle player order each "cycle" to mix
        playerIds = playerIds.sort(() => Math.random() - 0.5);
        playerIds.forEach(pid => {
          if (carsByPlayer[pid][i]) {
            interleaved.push(carsByPlayer[pid][i]);
          }
        });
      }

      // Group into rounds of 3
      const roundsData: any[] = [];
      for (let i = 0; i < interleaved.length; i += 3) {
        let slots = interleaved.slice(i, i + 3).map(c => ({
          ...c,
          result: 'pending'
        }));
        
        // Final sanity check: ensure no same player in a round if possible
        // (with small player pools, it might be impossible, but with many cars/players it usually works)
        roundsData.push({
          stage: 1,
          index: Math.floor(i / 3) + 1,
          slots,
          isFinished: false,
          isPublished: false,
          isConfirmed: false,
          createdAt: serverTimestamp()
        });
      }

      // Save to Firestore
      for (const r of roundsData) {
        const newRef = doc(collection(db, 'tournaments', selectedTournament.id, 'rounds'));
        batch.set(newRef, r);
      }

      // Update tournament status
      batch.update(doc(db, 'tournaments', selectedTournament.id), { status: 'active' });

      await batch.commit();
      alert('สร้างรอบการแข่งขันสำเร็จ!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'rounds_generation');
    }
  };

  if (!isAdmin || !user) {
    return (
      <div className="max-w-2xl mx-auto mt-32 px-4">
        <div className="bg-zinc-900 p-16 space-y-10 rounded-[40px] border-2 border-zinc-800 shadow-3xl text-center">
          <div className="flex flex-col items-center gap-6">
            <div className="p-6 bg-rose-600 rounded-[32px] shadow-2xl shadow-rose-600/40 rotate-3">
              <Shield size={64} className="text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-5xl font-black text-white italic tracking-tighter uppercase underline decoration-rose-600 decoration-8 underline-offset-8">ADMIN ENTRY</h2>
              <p className="text-zinc-500 text-lg font-bold uppercase tracking-[0.4em] italic">Authentication Required</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-8">
            <input
              type="password"
              placeholder="••••••••"
              className="bg-zinc-950 border-2 border-zinc-800 rounded-2xl w-full py-6 text-center text-4xl tracking-[0.5em] font-black text-rose-500 focus:border-rose-600 outline-none transition-all shadow-inner"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="p-6 bg-rose-600/5 border-2 border-rose-600/20 rounded-3xl space-y-4">
                  <p className="text-rose-500 text-center text-lg font-black italic tracking-tight">{error}</p>
                  
                  {error.includes('Anonymous Auth') && (
                    <div className="space-y-6 pt-6 border-t border-rose-600/10">
                      <p className="text-sm text-stone-300 font-bold uppercase italic text-center tracking-widest">Required Configuration:</p>
                      
                      <a 
                        href="https://console.firebase.google.com/project/gen-lang-client-0076452133/authentication/providers" 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-racing bg-emerald-600 text-white w-full py-5 flex items-center justify-center gap-4 text-lg rounded-2xl shadow-xl shadow-emerald-900/20"
                      >
                        <Shield size={24} />
                        OPEN FIREBASE CONSOLE
                      </a>

                      <div className="text-xs text-zinc-500 space-y-2 bg-black/40 p-6 rounded-3xl border border-zinc-800 text-left">
                        <p className="text-amber-500 font-black uppercase tracking-widest mb-2 italic">Instruction:</p>
                        <p className="flex gap-2"><span>1.</span><span>Click the button above to visit Firebase Console.</span></p>
                        <p className="flex gap-2"><span>2.</span><span>Go to <span className="text-stone-100 font-bold">Authentication</span> &gt; <span className="text-stone-100 font-bold">Sign-in method</span>.</span></p>
                        <p className="flex gap-2"><span>3.</span><span>Click <span className="text-stone-100 font-bold underline decoration-amber-500 decoration-2">Add new provider</span> and select <span className="text-stone-100 font-bold italic">Anonymous</span>.</span></p>
                        <p className="flex gap-2"><span>4.</span><span>Enable it and <span className="text-stone-100 font-bold">Save</span>.</span></p>
                      </div>
                    </div>
                  )}
                </div>

                {error.includes('Anonymous Auth') && (
                  <button 
                    type="button"
                    onClick={async () => {
                      try {
                        await loginWithGoogle();
                        setIsAdmin(true);
                        setError('');
                      } catch (e) {
                        setError("การเข้าสู่ระบบด้วย Google ล้มเหลว");
                      }
                    }} 
                    className="w-full py-5 flex items-center justify-center gap-4 text-lg font-black italic text-stone-400 bg-zinc-800 rounded-2xl hover:bg-zinc-700 hover:text-white transition-all shadow-lg active:scale-95"
                  >
                    <LogIn size={24} />
                    LOGIN WITH GOOGLE ACCOUNT
                  </button>
                )}
              </div>
            )}
            <button className="btn-racing bg-rose-600 text-white w-full py-6 text-2xl font-black italic shadow-2xl shadow-rose-600/30 rounded-2xl active:scale-95 transition-all">AUTHORIZED ACCESS</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 min-h-screen bg-zinc-950 -m-4 p-4 sm:-m-8 sm:p-8">
      {/* Admin Topbar */}
      <div className="sticky top-0 z-40 bg-zinc-900 shadow-2xl border-b-2 border-rose-900/30 py-6 mb-12 -mx-4 px-6 sm:-mx-8 sm:px-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-8">
            <button 
              onClick={() => setSelectedTournament(null)}
              className={cn(
                "flex items-center gap-4 px-6 py-3 rounded-xl transition-all font-black italic tracking-tighter uppercase",
                !selectedTournament ? "bg-rose-600 text-white shadow-2xl shadow-rose-600/20 scale-105" : "text-stone-400 hover:text-white bg-zinc-800"
              )}
            >
              <LayoutDashboard size={28} />
              <span className="text-3xl">แผงควบคุม</span>
            </button>
            
            {selectedTournament && (
              <>
                <div className="h-12 w-0.5 bg-zinc-700 hidden md:block" />
                <div className="flex flex-col">
                  <h2 className="text-white text-3xl font-black italic tracking-tight leading-none">{selectedTournament.name}</h2>
                  <p className="text-[12px] text-rose-500 font-bold uppercase tracking-[0.2em] mt-1">{selectedTournament.type} ADMINISTRATION</p>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={() => setShowAddModal(true)} className="btn-racing bg-amber-500 text-black hover:bg-white w-full md:w-auto py-3 px-8 h-14 text-lg">
              <Plus size={24} />
              <span>สร้างการแข่งขัน</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Tournament List Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <h3 className="text-base font-black uppercase tracking-[0.3em] text-stone-500 flex items-center gap-3 italic border-b border-zinc-800 pb-2">
            <Play size={18} className="text-rose-600" /> รายการแข่งทั้งหมด
          </h3>
            <div className="space-y-4">
              {tournaments.map(t => (
                <div 
                  key={t.id}
                  className={cn(
                    "racing-card group relative transition-all flex items-stretch overflow-hidden border-l-8 rounded-2xl",
                    selectedTournament?.id === t.id ? "bg-zinc-800 border-zinc-700 border-l-rose-600 shadow-2xl" : "bg-zinc-900 border-l-transparent hover:bg-zinc-800/80 hover:scale-[1.02]"
                  )}
                >
                  <div 
                    onClick={() => setSelectedTournament(t)}
                    className="flex-grow p-6 cursor-pointer"
                  >
                    <h4 className={cn("text-xl font-black italic transition-colors leading-tight", selectedTournament?.id === t.id ? "text-rose-500" : "text-stone-100")}>
                      {t.name}
                    </h4>
                    <p className="text-[12px] text-zinc-500 font-bold uppercase tracking-widest mt-1">{t.type} • {t.date}</p>
                    <div className="flex gap-4 mt-3">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-rose-600" />
                        <span className="text-[11px] text-stone-300 font-black uppercase italic">{t.totalParticipants} นักแข่ง</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Trophy size={14} className="text-amber-500" />
                        <span className="text-[11px] text-stone-300 font-black uppercase italic">{t.totalCars} คัน</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Delete Button Area - Separated from clickable card */}
                  <div className="flex items-center px-6 bg-zinc-950/20 border-l border-zinc-800/50 relative z-40">
                    <button 
                      type="button"
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        setTournamentToDelete({ id: t.id, name: t.name });
                      }}
                      className="p-4 text-zinc-600 hover:text-white hover:bg-rose-600 rounded-2xl transition-all flex items-center justify-center cursor-pointer group-hover:scale-110 active:scale-95 relative z-50 shadow-xl"
                      title="ลบรายการการแข่งขัน"
                    >
                      <Trash2 size={22} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          {selectedTournament ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b-2 border-zinc-900 pb-8">
                <div className="flex flex-col">
                  <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase">{selectedTournament.name}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-3 py-1 bg-rose-600/20 text-rose-500 border border-rose-600/30 rounded text-[10px] font-black uppercase tracking-widest italic">
                      {selectedTournament.status}
                    </span>
                    <span className="text-zinc-500 font-bold text-xs uppercase tracking-[0.2em]">{format(new Date(selectedTournament.date), 'MMMM d, yyyy')}</span>
                  </div>
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  <button 
                    onClick={() => navigate(`/referee/${selectedTournament.id}`)}
                    className="btn-racing-secondary text-base py-3 px-6 h-14"
                  >
                    <CheckCircle2 size={24} className="text-rose-500" />
                    เข้าสู่โหมดกรรมการ
                  </button>
                  {selectedTournament.status === 'registration' ? (
                    <button onClick={generateRounds} className="btn-racing bg-rose-600 text-white text-base py-3 px-6 h-14">
                      <RotateCcw size={24} />
                      สร้างรอบการแข่งขัน
                    </button>
                  ) : (
                    <button 
                      onClick={() => navigate(`/referee/${selectedTournament.id}`)}
                      className="btn-racing bg-amber-500 text-black text-base py-3 px-6 h-14 hover:bg-white"
                    >
                      <ArrowLeftRight size={24} />
                      จัดการสลับตัว
                    </button>
                  )}
                </div>
              </div>

              {/* Participant Management */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                <div className="space-y-10">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                    <h4 className="text-2xl font-black text-white italic uppercase flex items-center gap-3">
                      <Users size={28} className="text-rose-600" />
                      รายชื่อผู้สมัคร
                    </h4>
                    <div className="flex gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-black text-rose-500 italic leading-none">{selectedTournament.totalParticipants}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">นักแข่ง</p>
                      </div>
                      <div className="w-px h-8 bg-zinc-800 mx-2" />
                      <div className="text-right">
                        <p className="text-2xl font-black text-amber-500 italic leading-none">{selectedTournament.totalCars}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">จำนวนรถ</p>
                      </div>
                    </div>
                  </div>

                  {selectedTournament.status !== 'registration' && getStageTransitions().length > 0 && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h4 className="text-xl font-black uppercase text-amber-500 italic flex items-center gap-3">
                           <Trophy size={24} /> สรุปยอดรถที่เข้ารอบ
                         </h4>
                         <span className="text-[11px] text-zinc-500 font-black uppercase italic tracking-widest">REAL-TIME STATS</span>
                      </div>
                      
                      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                        {getStageTransitions().reverse().map((transition) => (
                          <div key={transition.from} className="bg-zinc-900 rounded-3xl border-2 border-zinc-800 overflow-hidden shadow-2xl">
                            <div className="p-4 bg-zinc-800/50 border-b-2 border-zinc-900 px-8 flex justify-between items-center">
                              <span className="text-sm font-black text-white uppercase italic tracking-[0.2em]">
                                รอบที่ {transition.from} → {transition.to}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-bold uppercase italic">QUALIFIERS</span>
                            </div>
                            <div className="p-8 space-y-4">
                              {transition.players.map(([name, count]) => (
                                <div key={name} className="flex justify-between items-center bg-zinc-950/40 p-5 rounded-2xl border border-zinc-800/50 hover:border-rose-900/30 transition-colors group">
                                  <span className="text-xl font-black text-stone-200 group-hover:text-rose-500 transition-colors italic">{name}</span>
                                  <div className="flex items-baseline gap-3">
                                    <span className="text-3xl font-black text-rose-500 italic">{count}</span>
                                    <span className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest">CARS</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <form className="flex gap-4" onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as any;
                    addParticipant(target.pName.value, parseInt(target.carCount.value));
                    target.pName.value = '';
                    target.carCount.value = '1';
                  }}>
                    <input name="pName" placeholder="ชื่อนักแข่ง" className="input-racing bg-zinc-900 border-zinc-800 text-lg h-16 px-6" required />
                    <input name="carCount" type="number" min="1" defaultValue="1" className="bg-zinc-900 border-2 border-zinc-800 rounded-2xl px-4 w-28 text-xl text-white font-black italic shadow-inner focus:border-rose-600 outline-none" required />
                    <button type="submit" className="bg-rose-600 px-8 rounded-2xl hover:bg-rose-500 transition-all text-white shadow-xl shadow-rose-600/20 active:scale-95">
                      <Plus size={32} />
                    </button>
                  </form>

                  <div className="bg-zinc-900 rounded-3xl border-2 border-zinc-800 divide-y-2 divide-zinc-800 max-h-[500px] overflow-y-auto shadow-2xl">
                    {participants.map(p => (
                      <div key={p.id} className="p-6 flex justify-between items-center group hover:bg-zinc-800/30 transition-colors">
                        <div>
                          <p className="font-black text-stone-100 text-xl italic tracking-tight">{p.name}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <p className="text-[11px] text-rose-500 font-black uppercase italic tracking-widest">{p.carCount} คันในรายการ</p>
                            {selectedTournament.status === 'registration' && (
                              <div className="flex items-center gap-2 ml-4">
                                <button 
                                  onClick={() => updateCarCount(p.id, -1)}
                                  className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-rose-600 rounded-lg text-lg text-white font-bold transition-all shadow-md active:scale-90"
                                  title="ลดจำนวนรถ"
                                >
                                  -
                                </button>
                                <button 
                                  onClick={() => updateCarCount(p.id, 1)}
                                  className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-rose-600 rounded-lg text-lg text-white font-bold transition-all shadow-md active:scale-90"
                                  title="เพิ่มจำนวนรถ"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setParticipantToDelete(p);
                          }}
                          className="p-4 text-zinc-800 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                        >
                          <Trash2 size={24} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-10">
                   <h4 className="text-2xl font-black text-white italic uppercase flex items-center gap-3 border-b border-zinc-800 pb-4">
                     <Shield size={28} className="text-rose-600" />
                     สถานะสนามแข่ง
                   </h4>
                   <div className="bg-zinc-900 p-12 rounded-[32px] border-4 border-dashed border-zinc-800 text-center space-y-8 shadow-inner">
                      {selectedTournament.status === 'registration' ? (
                        <>
                          <div className="w-24 h-24 bg-amber-500/10 text-amber-500 rounded-[32px] mx-auto flex items-center justify-center shadow-xl border border-amber-500/20 rotate-12">
                            <Plus size={48} />
                          </div>
                          <div className="space-y-4">
                            <p className="text-stone-100 text-3xl font-black italic tracking-tighter uppercase">รับสมัครนักแข่ง</p>
                            <p className="text-zinc-500 text-lg font-medium leading-relaxed max-w-sm mx-auto">ลงทะเบียนนักแข่งและจำนวนรถให้เรียบร้อยก่อนทำการสุ่มจับคู่รอบที่ 1</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-24 h-24 bg-rose-600/10 text-rose-500 rounded-[32px] mx-auto flex items-center justify-center shadow-xl border border-rose-600/20 -rotate-6">
                            <Play size={48} fill="currentColor" />
                          </div>
                          <div className="space-y-4">
                            <p className="text-stone-100 text-3xl font-black italic tracking-tighter uppercase">กำลังแข่งขัน</p>
                            <p className="text-zinc-500 text-lg font-medium leading-relaxed max-w-sm mx-auto">สามารถบันทึกผลการแข่งขันและตรวจสอบสถานะได้ที่หน้าแผงกรรมการ</p>
                          </div>
                        </>
                      )}
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <Plus size={64} className="text-asphalt-700" />
              <p className="text-asphalt-500 font-bold">เลือกรายการการแข่งขันหรือสร้างใหม่เพื่อเริ่มจัดการ</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Tournament Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-zinc-900 w-full max-w-xl p-12 space-y-10 animate-in zoom-in-95 duration-300 rounded-[40px] border-2 border-zinc-800 shadow-3xl">
            <h3 className="text-4xl font-black text-stone-100 italic uppercase tracking-tighter">สร้างสนามแข่งขันใหม่</h3>
            <form onSubmit={addTournament} className="space-y-8">
              <div className="space-y-3">
                <label className="text-[12px] font-black text-rose-500 uppercase tracking-[0.3em] ml-2 italic">ชื่อสนาม / รายการ</label>
                <input required className="input-racing bg-zinc-950 border-zinc-800 h-16 text-xl px-6 rounded-2xl" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น BANGKOK GRAND PRIX 2026" />
              </div>
              <div className="space-y-3">
                <label className="text-[12px] font-black text-rose-500 uppercase tracking-[0.3em] ml-2 italic">ประเภทการแข่ง</label>
                <select className="input-racing bg-zinc-950 border-zinc-800 h-16 text-xl px-6 rounded-2xl appearance-none" value={type} onChange={e => setType(e.target.value as TournamentType)}>
                  <option value="Opb">OPB CLASS</option>
                  <option value="Opb Upgrade">OPB UPGRADE</option>
                  <option value="Stock Class">STOCK CLASS</option>
                  <option value="Open Class">OPEN CLASS</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[12px] font-black text-rose-500 uppercase tracking-[0.3em] ml-2 italic">วันที่จัดการแข่งขัน</label>
                <input type="date" required className="input-racing bg-zinc-950 border-zinc-800 h-16 text-xl px-6 rounded-2xl" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="flex gap-6 pt-6">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-racing-secondary flex-1 h-16 text-lg rounded-2xl">ยกเลิก</button>
                <button type="submit" className="btn-racing bg-rose-600 text-white flex-1 h-16 text-lg rounded-2xl shadow-2xl shadow-rose-600/20">บันทึกข้อมูล</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Tournament Confirmation Modal */}
      {tournamentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-zinc-900 w-full max-w-xl p-12 space-y-8 border-2 border-rose-600/30 animate-in zoom-in-95 duration-300 rounded-[40px] shadow-3xl">
            <div className="flex items-center gap-6 text-rose-500">
              <div className="p-4 bg-rose-600/10 rounded-2xl border border-rose-600/20">
                <Trash2 size={42} />
              </div>
              <h3 className="text-4xl font-black italic uppercase tracking-tighter">ยืนยันการลบ?</h3>
            </div>
            
            <div className="space-y-6">
              <p className="text-stone-300 text-xl font-medium leading-relaxed">
                คุณกำลังจะลบรายการการแข่งขัน <span className="text-white font-black italic underline decoration-rose-600 underline-offset-8">"{tournamentToDelete.name}"</span> ใช่หรือไม่?
              </p>
              <div className="p-6 bg-rose-600/5 border-2 border-rose-600/20 rounded-3xl">
                <p className="text-sm font-black text-rose-500 uppercase tracking-widest italic flex items-center gap-2">
                  <Shield size={16} /> WARNING: SYSTEM DATA PURGE
                </p>
                <p className="text-stone-400 text-sm mt-3 leading-relaxed">ข้อมูลนักแข่ง รอบการแข่งขัน และสถิติทั้งหมดจะถูกลบออกถาวร ไม่สามารถกู้คืนได้ภายหลัง</p>
              </div>
            </div>

            <div className="flex gap-6 pt-4">
              <button 
                type="button" 
                onClick={() => setTournamentToDelete(null)} 
                className="btn-racing-secondary flex-1 h-16 text-lg rounded-2xl border-zinc-700 text-zinc-400"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={deleteTournament} 
                className="btn-racing bg-rose-600 text-white flex-1 h-16 text-lg rounded-2xl shadow-2xl shadow-rose-600/30"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Participant Confirmation Modal */}
      {participantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-zinc-900 w-full max-w-xl p-12 space-y-8 border-2 border-rose-600/30 animate-in zoom-in-95 duration-300 rounded-[40px] shadow-3xl">
            <div className="flex items-center gap-6 text-rose-500">
               <div className="p-4 bg-rose-600/10 rounded-2xl border border-rose-600/20">
                <Trash2 size={42} />
              </div>
              <h3 className="text-4xl font-black italic uppercase tracking-tighter">ลบผู้สมัคร?</h3>
            </div>
            
            <p className="text-stone-300 text-xl font-medium leading-relaxed">
              ยืนยันการลบนักแข่ง: <span className="text-white font-black italic underline decoration-rose-600 underline-offset-8">{participantToDelete.name}</span> ใช่หรือไม่?
            </p>

            <div className="flex gap-6 pt-6">
              <button 
                type="button" 
                onClick={() => setParticipantToDelete(null)} 
                className="btn-racing-secondary flex-1 h-16 text-lg rounded-2xl text-zinc-400 border-zinc-700"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={deleteParticipant} 
                className="btn-racing bg-rose-600 text-white flex-1 h-16 text-lg rounded-2xl shadow-2xl shadow-rose-600/30"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
