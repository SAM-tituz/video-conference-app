import * as mediasoup from "mediasoup";
import { Socket } from "socket.io";
import type { mockUser } from "../users";
export type RoomState = {
    router: mediasoup.types.Router;
    organizerId?: string;
    peers: Set<string>;
    breakoutRooms?: string[];
    assignments?: Map<string, string>;
};

export type PeerState = {
    socket: Socket;
    user: {id:string,name:string};
    roomName: string;
    transports: Map<string, mediasoup.types.Transport>;
    producers: Map<string, mediasoup.types.Producer>;
    consumers: Map<string, mediasoup.types.Consumer>;
    hasAudio: boolean;
    hasVideo: boolean;
};