import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { Shield, Plus, Edit2, Trash2, Users, Play, LogOut, CheckCircle2, RotateCcw, LogIn, LayoutDashboard } from 'lucide-react';
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
      setTournaments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tournaments');
    });
    return () => unsubscribe();
  }, [isAdmin, user]);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'UMC9896') {
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
      <div className="max-w-md mx-auto mt-20">
        <div className="racing-card p-8 space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-racing-red rounded-full">
              <Shield size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">การเข้าถึงของผู้ดูแลระบบ</h2>
            <p className="text-asphalt-500 text-sm">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งานระบบ</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="รหัสผ่าน"
              className="input-racing text-center text-xl tracking-widest font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-4 bg-racing-red/10 border border-racing-red/20 rounded-lg space-y-3">
                  <p className="text-racing-red text-center text-sm font-bold">{error}</p>
                  
                  {error.includes('Anonymous Auth') && (
                    <div className="space-y-3 pt-2 border-t border-racing-red/10">
                      <p className="text-[11px] text-white font-bold uppercase italic text-center">ต้องตั้งค่าใน Firebase Console ครั้งแรก:</p>
                      
                      <a 
                        href="https://console.firebase.google.com/project/gen-lang-client-0076452133/authentication/providers" 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-racing bg-racing-green text-black w-full py-2 flex items-center justify-center gap-2 text-xs"
                      >
                        <Shield size={14} />
                        เปิดหน้าตั้งค่า Firebase
                      </a>

                      <div className="text-[10px] text-asphalt-400 space-y-1 bg-black/40 p-3 rounded border border-white/5">
                        <p className="text-racing-yellow font-bold mb-1">ขั้นตอน:</p>
                        <p>1. กดปุ่มสีเขียวด้านบน (เปิดหน้าตั้งค่า)</p>
                        <p>2. กด <span className="text-white font-bold">Add new provider</span></p>
                        <p>3. เลือก <span className="text-white font-bold">Anonymous</span></p>
                        <p>4. กดปุ่ม <span className="text-white font-bold">Enable</span> แล้วกด <span className="text-white font-bold">Save</span></p>
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
                    className="btn-racing-secondary w-full py-2 flex items-center justify-center gap-2"
                  >
                    <LogIn size={16} />
                    ล็อคอินด้วย Google แทน (ถ้ายังไม่พร้อมตั้งค่า)
                  </button>
                )}
              </div>
            )}
            <button className="btn-racing w-full py-3">เข้าสู่แผงควบคุม</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Topbar */}
      <div className="sticky top-0 z-30 bg-asphalt-900/80 backdrop-blur-md border-b border-asphalt-800 py-4 mb-8 -mx-4 px-4 sm:-mx-8 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedTournament(null)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-black italic tracking-tighter uppercase",
                !selectedTournament ? "bg-racing-red text-white shadow-lg shadow-racing-red/20 scale-105" : "text-asphalt-400 hover:text-white bg-asphalt-800"
              )}
            >
              <LayoutDashboard size={20} />
              <span className="text-xl">แผงควบคุม</span>
            </button>
            
            {selectedTournament && (
              <>
                <div className="h-8 w-px bg-asphalt-700 hidden md:block" />
                <div className="flex flex-col">
                  <h2 className="text-white font-bold leading-tight">{selectedTournament.name}</h2>
                  <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-widest">{selectedTournament.type} MANAGER</p>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={() => setShowAddModal(true)} className="btn-racing w-full md:w-auto py-2 h-10">
              <Plus size={18} />
              <span>สร้างการแข่งขัน</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Tournament List Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-asphalt-500 flex items-center gap-2">
            <Play size={14} /> รายการแข่ง
          </h3>
            <div className="space-y-3">
              {tournaments.map(t => (
                <div 
                  key={t.id}
                  className={cn(
                    "racing-card group relative transition-all flex items-stretch overflow-hidden border-l-4",
                    selectedTournament?.id === t.id ? "bg-asphalt-700 border-asphalt-600 border-l-racing-red" : "border-l-transparent hover:bg-asphalt-700/50"
                  )}
                >
                  <div 
                    onClick={() => setSelectedTournament(t)}
                    className="flex-grow p-4 cursor-pointer"
                  >
                    <h4 className={cn("font-bold transition-colors", selectedTournament?.id === t.id ? "text-racing-red" : "text-white")}>
                      {t.name}
                    </h4>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase">{t.type} • {t.date}</p>
                  </div>
                  
                  {/* Delete Button Area - Separated from clickable card */}
                  <div className="flex items-center px-4 bg-asphalt-900/10 border-l border-asphalt-800 relative z-40">
                    <button 
                      type="button"
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        setTournamentToDelete({ id: t.id, name: t.name });
                      }}
                      className="p-3 text-asphalt-600 hover:text-white hover:bg-racing-red rounded-xl transition-all flex items-center justify-center cursor-pointer group-hover:scale-105 active:scale-95 relative z-50 shadow-sm"
                      title="ลบรายการการแข่งขัน"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          {selectedTournament ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex justify-end items-center gap-4 border-b border-asphalt-800 pb-4">
                <div className="flex gap-2">
                  <button 
                    onClick={() => navigate(`/referee/${selectedTournament.id}`)}
                    className="btn-racing-secondary text-xs"
                  >
                    <CheckCircle2 size={16} className="text-racing-green" />
                    เข้าสู่โหมดกรรมการ
                  </button>
                  {selectedTournament.status === 'registration' && (
                    <button onClick={generateRounds} className="btn-racing text-xs">
                      <RotateCcw size={16} />
                      สร้างรอบการแข่งขัน
                    </button>
                  )}
                </div>
              </div>

              {/* Participant Management */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                      <Users size={18} className="text-racing-red" />
                      ผู้สมัคร
                    </h4>
                    <span className="text-xs bg-asphalt-800 text-asphalt-400 px-2 py-1 rounded border border-asphalt-700">
                      ทั้งหมด: {selectedTournament.totalCars} คัน
                    </span>
                  </div>

                  <form className="flex gap-2" onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as any;
                    addParticipant(target.pName.value, parseInt(target.carCount.value));
                    target.pName.value = '';
                    target.carCount.value = '1';
                  }}>
                    <input name="pName" placeholder="ชื่อนักแข่ง" className="input-racing text-sm" required />
                    <input name="carCount" type="number" min="1" defaultValue="1" className="bg-asphalt-700 border border-asphalt-600 rounded px-2 w-16 text-sm outline-none focus:border-racing-red" required />
                    <button type="submit" className="bg-racing-red p-2 rounded hover:brightness-110 transition-all text-white">
                      <Plus size={20} />
                    </button>
                  </form>

                  <div className="bg-asphalt-800/50 rounded-lg border border-asphalt-700 divide-y divide-asphalt-700 max-h-[400px] overflow-y-auto">
                    {participants.map(p => (
                      <div key={p.id} className="p-3 flex justify-between items-center group">
                        <div>
                          <p className="font-bold text-white text-sm">{p.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-asphalt-500 font-bold uppercase">{p.carCount} คัน</p>
                            {selectedTournament.status === 'registration' && (
                              <div className="flex items-center gap-1 ml-2">
                                <button 
                                  onClick={() => updateCarCount(p.id, -1)}
                                  className="w-5 h-5 flex items-center justify-center bg-asphalt-700 hover:bg-asphalt-600 rounded text-xs text-white transition-colors"
                                  title="ลดจำนวนรถ"
                                >
                                  -
                                </button>
                                <button 
                                  onClick={() => updateCarCount(p.id, 1)}
                                  className="w-5 h-5 flex items-center justify-center bg-asphalt-700 hover:bg-asphalt-600 rounded text-xs text-white transition-colors"
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
                          className="p-2 text-asphalt-700 hover:text-racing-red opacity-0 group-hover:opacity-100 transition-all font-bold"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                   <h4 className="text-lg font-bold text-white">สถานะการแข่งขัน</h4>
                   <div className="racing-card p-6 border-dashed border-asphalt-700 text-center space-y-4">
                      {selectedTournament.status === 'registration' ? (
                        <>
                          <div className="w-12 h-12 bg-racing-yellow/10 text-racing-yellow rounded-full mx-auto flex items-center justify-center">
                            <Plus size={24} />
                          </div>
                          <div>
                            <p className="text-white font-bold">เปิดรับสมัคร</p>
                            <p className="text-asphalt-500 text-xs mt-1">เพิ่มผู้สมัครและรถทั้งหมดก่อนสร้างการแข่งขันรอบที่ 1</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-racing-green/10 text-racing-green rounded-full mx-auto flex items-center justify-center">
                            <Play size={24} />
                          </div>
                          <div>
                            <p className="text-white font-bold">กำลังดำเนินการแข่งขัน</p>
                            <p className="text-asphalt-500 text-xs mt-1">คำนวณรอบการแข่งขันแล้ว ไปที่หน้ากรรมการเพื่อบันทึกผล</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="racing-card w-full max-w-md p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-white italic">สร้างการแข่งขันใหม่</h3>
            <form onSubmit={addTournament} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-asphalt-500 uppercase tracking-widest">ชื่อรายการ</label>
                <input required className="input-racing" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น Bangkok Speed Cup" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-asphalt-500 uppercase tracking-widest">ประเภท</label>
                <select className="input-racing" value={type} onChange={e => setType(e.target.value as TournamentType)}>
                  <option value="Opb">Opb</option>
                  <option value="Opb Upgrade">Opb Upgrade</option>
                  <option value="Stock Class">Stock Class</option>
                  <option value="Open Class">Open Class</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-asphalt-500 uppercase tracking-widest">วันที่แข่งขัน</label>
                <input type="date" required className="input-racing" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-racing-secondary flex-1">ยกเลิก</button>
                <button type="submit" className="btn-racing flex-1">สร้างรายการ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Tournament Confirmation Modal */}
      {tournamentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="racing-card w-full max-w-md p-8 space-y-6 border-racing-red/50 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-racing-red">
              <div className="p-2 bg-racing-red/10 rounded-lg">
                <Trash2 size={24} />
              </div>
              <h3 className="text-2xl font-black italic">ลบรายการการแข่งขัน?</h3>
            </div>
            
            <div className="space-y-4">
              <p className="text-asphalt-300">
                ยืนยันที่จะลบรายการการแข่งขัน <span className="text-white font-bold">"{tournamentToDelete.name}"</span> ใช่หรือไม่?
              </p>
              <div className="p-4 bg-racing-red/5 border border-racing-red/20 rounded-lg">
                <p className="text-xs text-racing-red font-bold">⚠️ ข้อมูลผู้สมัครและรอบการแข่งขันทั้งหมดจะถูกลบออกจากระบบและไม่สามารถกู้คืนได้</p>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                type="button" 
                onClick={() => setTournamentToDelete(null)} 
                className="btn-racing-secondary flex-1"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={deleteTournament} 
                className="btn-racing bg-racing-red flex-1"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Participant Confirmation Modal */}
      {participantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="racing-card w-full max-w-md p-8 space-y-6 border-racing-red/50 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-racing-red">
               <div className="p-2 bg-racing-red/10 rounded-lg">
                <Trash2 size={24} />
              </div>
              <h3 className="text-2xl font-black italic">ลบผู้สมัคร?</h3>
            </div>
            
            <p className="text-asphalt-300">
              ยืนยันการลบผู้สมัคร: <span className="text-white font-bold">{participantToDelete.name}</span> ใช่หรือไม่?
            </p>

            <div className="flex gap-4 pt-2">
              <button 
                type="button" 
                onClick={() => setParticipantToDelete(null)} 
                className="btn-racing-secondary flex-1"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={deleteParticipant} 
                className="btn-racing bg-racing-red flex-1"
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
