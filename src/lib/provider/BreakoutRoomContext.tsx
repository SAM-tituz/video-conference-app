"use client";
import { createContext, useContext } from "react";
import { Participant } from "./ParticipantContext";

export type BreakoutRoomContextType = {
  breakoutRooms: string[];
  assignments: Map<string, string>;
mainRoomParticipants: Participant[];
  // Breakout functions
  createBreakoutRooms: (numRooms: number) => void;
  assignPeerToRoom: (peerId: string, roomName: string) => void;
  startBreakouts: () => void;
  endBreakouts: () => void;
  exitBreakoutRoom: () => void;
};

export const BreakoutRoomContext = createContext<
  BreakoutRoomContextType | undefined
>(undefined);

export const useBreakoutRoom = () => {
  const context = useContext(BreakoutRoomContext);
  if (!context) {
    throw new Error("useBreakoutRoom must be used within a MediaSoupProvider");
  }
  return context;
};