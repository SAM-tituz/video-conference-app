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
import { Input } from "@/components/ui/input"; // Assuming you have this
import { Button } from "@/components/ui/button"; // Assuming you have this
import { Send } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/provider/authprovider"; // To get local user's name

// Define the message type (can be moved to a shared types file)
interface Message {
  id: string;
  senderName: string;
  text: string;
}

interface ChatPanelProps {
  children: React.ReactNode; // This will be the trigger button
  messages: Message[];
  onSendMessage: (text: string) => void;
}

export const ChatPanel = ({
  children,
  messages,
  onSendMessage,
}: ChatPanelProps) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage("");
    }
  }; // Auto-scroll to bottom when new messages arrive

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  return (
    <Sheet>
            <SheetTrigger asChild>{children}</SheetTrigger>   
      <SheetContent className="bg-gray-900 border-l-gray-700 text-white flex flex-col h-full">
        <SheetHeader>
          <SheetTitle className="text-white">Chat</SheetTitle>     
        </SheetHeader>
        <SheetDescription className="sr-only">
          Meeting chat messages
        </SheetDescription>
        {/* Message List */}     
        <ScrollArea className="flex-1 my-4 pr-4" ref={scrollAreaRef}>
          <div className="space-y-4">
             
            {messages.map((msg) => {
              const isLocalUser = msg.senderName === user?.name; // Check if message is from "You"
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

                  <div
                    className={`p-3 rounded-lg max-w-[80%] ${
                      isLocalUser ? "bg-indigo-700" : "bg-gray-700"
                    }`}
                  >
                    {!isLocalUser && (
                      <p className="text-xs font-semibold text-gray-300 mb-1">
                        {msg.senderName}                   
                      </p>
                    )}
                    <p className="text-sm break-words">{msg.text}</p>       
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {/* Send Message Form */}     
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 pt-4 border-t border-gray-700"
        >
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
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
      </SheetContent>
    </Sheet>
  );
};
