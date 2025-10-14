"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users } from "lucide-react";

interface ParticipantsPanelProps {
  participants: { id: string; name: string; isLocal: boolean }[];
}

export const ParticipantsPanel = ({ participants }: ParticipantsPanelProps) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-white bg-transparent hover:bg-gray-700 transition-colors duration-200">
          <Users className="w-6 h-6" />
        </button>
      </SheetTrigger>
      <SheetContent className="bg-gray-900 border-l-gray-700 text-white">
        <SheetHeader>
          <SheetTitle className="text-white">
            Participants ({participants.length})
          </SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only"/>
             
          <ScrollArea className="h-[calc(100%-4rem)] mt-4">
            <div className="space-y-4">
              {participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-indigo-600 text-white">
                      {p.name ? p.name.charAt(0).toUpperCase() : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>
                    {p.name || `Peer-${p.id.slice(0, 4)}`}{" "}
                    {p.isLocal && "(You)"}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
