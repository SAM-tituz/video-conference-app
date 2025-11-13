// components/meeting/[roomName]/components/ChatPanel.tsx

"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, ArrowLeft, Users } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/provider/authprovider";
import { useChat, Message } from "@/lib/provider/ChatContext";
import { useParticipant, Participant } from "@/lib/provider/ParticipantContext"; // ✅ 1. Import participants
import { cn } from "@/lib/utils"; // Assuming you have cn from shadcn

export const ChatPanel = () => {
  const { user } = useAuth();
  const {
    isChatOpen,
    setIsChatOpen,
    currentChatTarget,
    setCurrentChatTarget,
    publicMessages,
    privateMessages,
    sendPublicMessage,
    sendPrivateMessage,
    unreadMessages,
    clearUnreadMessages,
  } = useChat();

  // ✅ Get participants to show their names in the conversation list
  const { participants } = useParticipant();
  const [newMessage, setNewMessage] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // --- Data Preparation ---
  const isPublic = currentChatTarget === null;
  const currentChatId = isPublic ? "public" : currentChatTarget.userId;
  const messages = isPublic
    ? publicMessages
    : privateMessages.get(currentChatId) || [];

  // ✅ Get a list of all participants you have a private chat with
  const privateChatUserIds = Array.from(privateMessages.keys());
  const privateChatParticipants = privateChatUserIds
    .map((userId) => participants.find((p) => p.userId === userId))
    .filter((p): p is Participant => !!p); // Filter out any undefined

  // ✅ Check for *any* unread message for the main red dot
  const hasUnread = unreadMessages.size > 0;

  // --- Event Handlers ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text) return;

    if (currentChatTarget) {
      sendPrivateMessage(text, currentChatTarget.userId);
    } else {
      sendPublicMessage(text);
    }
    setNewMessage("");
  };

  // ✅ When we select a conversation, switch the view and clear notifications
  const selectConversation = (participant: Participant | null) => {
    const newTargetId = participant ? participant.userId : "public";
    setCurrentChatTarget(participant);
    clearUnreadMessages(newTargetId);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Clear unread dot when panel opens
  useEffect(() => {
    if (isChatOpen) {
      clearUnreadMessages(currentChatId);
    }
  }, [isChatOpen, currentChatId, clearUnreadMessages]);

  return (
    <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
      <SheetTrigger asChild>
        <button className="relative w-12 h-12 rounded-full flex items-center justify-center text-white bg-transparent hover:bg-gray-700 transition-colors duration-200">
          <MessageSquare className="w-6 h-6" />
          {hasUnread && (
            <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-900" />
          )}
        </button>
      </SheetTrigger>

      {/* ✅ Make the panel wider to fit two columns */}
      <SheetContent className="bg-gray-900 border-l-gray-700 text-white flex flex-col h-full !max-w-[600px] sm:!max-w-[600px]">
        <SheetHeader>
          <SheetTitle className="text-white">Chat</SheetTitle>
        </SheetHeader>

        {/* --- ✅ NEW Two-Column Layout --- */}
        <div className="flex flex-row flex-1 mt-4 border-t border-gray-700 -mx-6 h-[calc(100%-60px)]">
          {/* --- Column 1: Conversation List --- */}
          <div className="w-1/3 border-r border-gray-700 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="py-4 space-y-1">
                {/* Public Chat Button */}
                <button
                  onClick={() => selectConversation(null)}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-gray-700",
                    isPublic && "bg-gray-700"
                  )}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gray-600 text-white">
                      <Users className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 truncate">
                    <span className="text-sm font-medium">Public Chat</span>
                  </div>
                  {unreadMessages.get("public") && (
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                  )}
                </button>

                {/* Private Chat Buttons */}
                {privateChatParticipants.map((p) => (
                  <button
                    key={p.userId}
                    onClick={() => selectConversation(p)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-gray-700",
                      currentChatTarget?.userId === p.userId && "bg-gray-700"
                    )}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-indigo-600 text-white text-xs">
                        {p.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 truncate">
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    {unreadMessages.get(p.userId) && (
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* --- Column 2: Message View --- */}
          <div className="w-2/3 flex flex-col h-full">
            <ScrollArea className="flex-1 px-4 py-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isLocalUser = msg.senderId === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3 ${
                        isLocalUser ? "justify-end" : ""
                      }`}
                    >
                      {!isLocalUser && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-indigo-600 text-white text-xs">
                            {msg.senderName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div>
                        {!isLocalUser && (
                          <p className="text-xs font-semibold text-gray-300 mb-1 ml-1">
                            {msg.senderName}
                          </p>
                        )}
                        <div
                          className={`p-3 rounded-lg max-w-[250px] ${
                            isLocalUser
                              ? "bg-indigo-700 text-right"
                              : "bg-gray-700"
                          }`}
                        >
                          <p className="text-sm break-words">{msg.text}</p>
                        </div>
                      </div>
                      {isLocalUser && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-indigo-600 text-white text-xs">
                            {msg.senderName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 p-4 border-t border-gray-700"
            >
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  currentChatTarget
                    ? `Private message to ${currentChatTarget.name}`
                    : "Type a public message..."
                }
                className="bg-gray-800 border-gray-700 text-white"
              />
              <Button
                type="submit"
                size="icon"
                className="bg-indigo-600 hover:bg-indigo-700 flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
