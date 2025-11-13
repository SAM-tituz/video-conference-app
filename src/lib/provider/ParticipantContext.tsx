"use client";
import { createContext, useContext } from "react";

export type Participant = {
  id: string;
  userId: string;
  name: string;
  isLocal?: boolean;
  isOrganizer?: boolean;
  hasAudio?: boolean; // You'll need to update this from your provider
  hasVideo?: boolean;
};

export type ParticipantContextType = {
  participants: Participant[];
  isOrganizer: boolean;

  // Moderation functions
  remoteMutePeer: (peerId: string) => void;
  remoteStopVideoPeer: (peerId: string) => void;
  kickPeer: (peerId: string) => void;
  endMeeting: () => void;
  muteAllPeers: () => void;
  transferRole: (userId: string) => void;
};

export const ParticipantContext = createContext<
  ParticipantContextType | undefined
>(undefined);

export const useParticipant = () => {
  const context = useContext(ParticipantContext);
  if (!context) {
    throw new Error("useParticipant must be used within a MediaSoupProvider");
  }
  return context;
};
