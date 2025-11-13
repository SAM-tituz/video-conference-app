"use"
import { createContext, useContext } from "react";
import { Participant } from "./ParticipantContext";

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
}

export type ChatContextType = {
  isChatOpen: boolean;
  setIsChatOpen: (isOpen: boolean) => void;
  currentChatTarget: Participant | null; // null = Public Chat
  setCurrentChatTarget: (participant: Participant | null) => void;

  publicMessages: Message[];
  privateMessages: Map<string, Message[]>; // Key: other user's ID

  sendPublicMessage: (text: string) => void;
  sendPrivateMessage: (text: string, targetUserId: string) => void;
  unreadMessages: Map<string, boolean>; // Key: "public" or a userId
  clearUnreadMessages: (targetId: string) => void;
};

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a MediaSoupProvider");
  }
  return context;
};