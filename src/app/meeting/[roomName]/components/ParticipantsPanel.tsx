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
import {
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MoreVertical,
  LogOut,
} from "lucide-react"; // Import new icons
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
interface Participant {
  id: string;
  name: string;
  isLocal: boolean;
  isOrganizer?: boolean;
  hasAudio?: boolean;
  hasVideo?: boolean;
}

interface ParticipantsPanelProps {
  participants: Participant[];
  isCurrentUserOrganizer: boolean; // Is the viewing user an organizer?
  onRemoteMute: (peerId: string) => void;
  onRemoteStopVideo: (peerId: string) => void;
  onKickPeer: (peerId: string) => void;
}

export const ParticipantsPanel = ({
  participants,
  isCurrentUserOrganizer,
  onRemoteMute,
  onRemoteStopVideo,
  onKickPeer,
}: ParticipantsPanelProps) => {
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
        <SheetDescription className="sr-only" />

        <ScrollArea className="h-[calc(100%-4rem)] mt-4">
          <div className="space-y-4">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 group"
              >
                {" "}
                {/* Added justify-between */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {" "}
                  {/* Allow shrinking */}
                  <Avatar>
                    <AvatarFallback className="bg-indigo-600 text-white">
                      {p.name ? p.name.charAt(0).toUpperCase() : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {" "}
                    {/* Prevent long names overflowing */}
                    {p.name || `Peer-${p.id.slice(0, 4)}`}{" "}
                    {p.isLocal && "(You)"}
                  </span>
                </div>
                {/* Media Status Icons */}
                <div className="flex items-center gap-2">
                  {p.hasAudio ? (
                    <Mic className="w-4 h-4 text-green-400" />
                  ) : (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  {p.hasVideo ? (
                    <Video className="w-4 h-4 text-green-400" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-red-400" />
                  )}
                </div>
                {/* Organizer Menu (Show only if viewer is organizer AND target is not self) */}
                {isCurrentUserOrganizer && !p.isLocal && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded-full text-gray-400 hover:bg-gray-700  transition-opacity">
                        {" "}
                        {/* Initially hidden */}
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 text-white border-gray-700">
                      <DropdownMenuItem
                        onSelect={() => onRemoteMute(p.id)}
                        className="hover:bg-gray-700 cursor-pointer"
                      >
                        <MicOff className="w-4 h-4 mr-2" /> Mute Audio
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onRemoteStopVideo(p.id)}
                        className="hover:bg-gray-700 cursor-pointer"
                      >
                        <VideoOff className="w-4 h-4 mr-2" /> Stop Video
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onKickPeer(p.id)}
                        className="text-red-400 hover:bg-red-900 hover:text-red-300 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 mr-2" /> Kick Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
