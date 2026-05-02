export type TournamentType = "Opb" | "Opb Upgrade" | "Stock Class" | "Open Class";
export type TournamentStatus = "registration" | "active" | "finished";
export type RoundResult = "1" | "2" | "3" | "DNF" | "pending";

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  date: string;
  status: TournamentStatus;
  totalParticipants: number;
  totalCars: number;
  winner1?: string;
  winner2?: string;
  winner3?: string;
  createdAt: any;
}

export interface Participant {
  id: string;
  name: string;
  carCount: number;
  createdAt: any;
}

export interface RoundSlot {
  participantId: string;
  playerName: string;
  carIndex: number;
  result: RoundResult;
}

export interface Round {
  id: string;
  stage: number; // 1, 2, 3...
  index: number;
  slots: RoundSlot[];
  isFinished: boolean;
  isConfirmed?: boolean;
  createdAt: any;
}
