import * as mediasoup from "mediasoup";
type Router = mediasoup.types.Router;
import { Socket } from "socket.io";
import { RoomState, PeerState } from "./helper/types";
import {
  handleKickPeer,
  handleMutePeer,
  handleStopVideoPeer,
} from "./helper/organizePower";
import { randomUUID } from "crypto";
let worker: mediasoup.types.Worker;

export const rooms: Record<string, RoomState> = {};
export const peers: Record<string, PeerState> = {};
const createWorker = async () => {
  try {
    worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 40000, //2000
      rtcMaxPort: 49999, //2025
    });

    console.log("Mediasoup worker created PID:", worker.pid);

    worker.on("died", () => {
      console.error("Mediasoup worker died, exiting...");
      process.exit(1);
    });

    return worker;
  } catch (error) {
    console.error("Failed to create mediasoup worker:", error);
    throw error;
  }
};

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: "audio" as const,
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video" as const,
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];
export const initMediasoup = async (io: any) => {
  try {
    worker = await createWorker();

    const connections = io.of("/mediasoup"); // Centralized function to broadcast the complete breakout room state to all organizers.

    const broadcastBreakoutState = (mainRoomName: string) => {
      const mainRoom = rooms[mainRoomName];
      if (!mainRoom) return;
      const allPeerIds = Object.keys(peers); // This map creates a (ParticipantObject | null)[] array
      const participantListWithNulls = allPeerIds.map((peerId) => {
        const peer = peers[peerId]; // Check if peer exists AND is in the main room OR a breakout of that main room
        if (peer && peer.roomName.startsWith(mainRoomName)) {
          const isPeerOrganizer = peer.user.id === mainRoom.organizerId;
          return {
            id: peer.socket.id,
            userId: peer.user.id,
            name: peer.user.name,
            isOrganizer: isPeerOrganizer,
            hasAudio: peer.hasAudio,
            hasVideo: peer.hasVideo,
          };
        }
        return null;
      });
      const mainRoomParticipantList = participantListWithNulls.filter(
        (p): p is NonNullable<typeof p> => p !== null
      );
      const state = {
        breakoutRoomNames: mainRoom.breakoutRooms ?? [],
        assignments: Array.from(mainRoom.assignments?.entries() ?? []),
        mainRoomParticipants: mainRoomParticipantList, // This is now correctly typed as T[]
      };

      mainRoomParticipantList
        .filter((p) => p.isOrganizer)
        .forEach((organizer) => {
          const organizerPeer = peers[organizer.id];
          if (organizerPeer) {
            organizerPeer.socket.emit("organizer:breakoutState", state);
          }
        });
    };
    //
    connections.on("connection", async (socket: Socket) => {
      console.log("new connectiion", socket.id);
      // connection-success
      socket.emit("connection-success", {
        socketId: socket.id,
      });
      //
      //
      socket.on("disconnect", () => {
        console.log("peer disconnected", socket.id);
        const peer = peers[socket.id];
        if (!peer) return; // Exit if peer already cleaned up
        const roomName = peer.roomName;
        const mainRoomName = roomName.split("-breakout-")[0];

        if (rooms[roomName]) {
          rooms[roomName].peers.delete(socket.id);
          // ✅ When a user disconnects, broadcast the updated list to the remaining peers
          const participantList = getParticipantListForRoom(roomName);
          connections.to(roomName).emit("room-participants", participantList);
        }
        if (peer) {
          cleanupPeer(socket.id);
          delete peers[socket.id];
          if (rooms[mainRoomName]) {
            broadcastBreakoutState(mainRoomName);
          }
        }
      });
      //
      // Helper function for checking organizer permissions
      const isOrganizer = (
        socketId: string
      ): { peer: PeerState; mainRoom: RoomState } | false => {
        const peer = peers[socketId];
        if (!peer) return false;

        const mainRoomName = peer.roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        if (!mainRoom || peer.user.id !== mainRoom.organizerId) {
          console.warn(
            `Non-organizer (User: ${peer.user.name}) attempted an action.`
          );
          return false;
        }
        return { peer, mainRoom };
      };

      //
      const createRoom = async (roomName: string): Promise<Router> => {
        let room = rooms[roomName];

        if (!room) {
          const router = await worker.createRouter({ mediaCodecs });
          room = {
            router,
            peers: new Set(),
            breakoutRooms: [],
            assignments: new Map<string, string>(),
            organizerId: undefined,
          };
          rooms[roomName] = room;
        }

        return room.router;
      };
      //
      socket.on(
        "joinRoom",
        async ({ roomName, participantId, participantName }, callback) => {
          let user = { id: participantId, name: participantName };
          if (!user) {
            console.error(`User with id ${participantId} not found`);
            return callback({ error: "User not found" });
          }
          const router = await createRoom(roomName);
          rooms[roomName].peers.add(socket.id);

          peers[socket.id] = {
            socket,
            roomName,
            user: user,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
            hasAudio: false, // Will be set true when producer is created
            hasVideo: false, // Will be set true when producer is created
          };
          socket.join(roomName);

          const mainRoomName = roomName.split("-breakout-")[0];
          const mainRoom = rooms[mainRoomName];
          if (!mainRoom) {
            console.error(
              `Could not find main room "${mainRoomName}" for a user joining "${roomName}".`
            );
            return callback({ error: "Associated main room not found." });
          }
          if (roomName === mainRoomName && !mainRoom.organizerId) {
            mainRoom.organizerId = user.id; // This user is now the organizer
            console.log(
              `ORGANIZER SET: ${user.name} (ID: ${user.id}) is the organizer for ${mainRoomName}`
            );
          }
          const isPeerOrganizer = user.id === mainRoom.organizerId;

          if (
            isPeerOrganizer &&
            mainRoom.breakoutRooms &&
            mainRoom.breakoutRooms.length > 0
          ) {
            socket.emit("organizer:breakoutState", {
              breakoutRoomNames: mainRoom.breakoutRooms,
              assignments: Array.from(mainRoom.assignments?.entries() ?? []),
            });
            console.log("breakout state", mainRoom.assignments);
          }

          const participantList = getParticipantListForRoom(roomName);

          connections.to(roomName).emit("room-participants", participantList);

          if (roomName !== mainRoomName) {
            const mainRoomList = Array.from(mainRoom.peers)
              .map((id) => {
                const peer = peers[id];
                if (!peer) {
                  return null;
                }
                return {
                  id,
                  userId: peer.user.id,
                  name: peers[id]?.user.name,
                  isOrganizer: isPeerOrganizer,
                };
              })
              .filter(Boolean);
            connections
              .to(mainRoomName)
              .emit("room-participants", mainRoomList);
          }
          broadcastBreakoutState(mainRoomName);
          callback({ rtpCapabilities: router.rtpCapabilities });
        }
      );
      //

      socket.on("createWebRtcTransport", async ({}, callback) => {
        const peer = peers[socket.id];
        if (!peer) {
          console.error(`Received event from unknown peer: ${socket.id}`);
          // Optionally send an error back to the client
          return callback({
            error: "Peer not found. Please join the room first.",
          });
        }
        const { roomName } = peers[socket.id];
        const router = rooms[roomName].router;
        console.log(
          `SERVER: Creating transport for peer ${peer.user.name} in room ${peer.roomName}`
        );
        const transport = await createWebRtcTransport(router);
        peer.transports.set(transport.id, transport);
        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      });

      //
      socket.on(
        "transport-connect",
        async ({ transportId, dtlsParameters }) => {
          const transport = peers[socket.id]?.transports.get(transportId);
          if (!transport) return;
          await transport.connect({ dtlsParameters });
        }
      );
      //
      socket.on(
        "transport-produce",
        async ({ kind, rtpParameters, transportId }, callback) => {
          const peer = peers[socket.id];
          const transport = peer?.transports.get(transportId);
          if (!transport) return;
          const producer = await transport.produce({ kind, rtpParameters });
          const { roomName } = peers[socket.id];
          peer.producers.set(producer.id, producer); // Inform other peers
          if (kind === "audio") {
            peer.hasAudio = true;
          } else if (kind === "video") {
            peer.hasVideo = true;
          }

          for (const peerId of rooms[roomName].peers) {
            if (peerId !== socket.id) {
              peers[peerId]?.socket.emit("new-producer", {
                producerId: producer.id,
                peerId: socket.id,
              });
            }
          }
          const participantList = getParticipantListForRoom(roomName);
          connections.to(roomName).emit("room-participants", participantList);
          // console.log(participantList);
          callback({ id: producer.id });
        }
      );
      //
      socket.on("getProducers", (callback) => {
        const { roomName } = peers[socket.id];
        const producersData = [];
        for (const peerId of rooms[roomName].peers) {
          if (peerId !== socket.id) {
            const peer = peers[peerId];
            if (peer && peer.producers.size > 0) {
              const producerIds = Array.from(peer.producers.keys());

              producersData.push({
                peerId: peerId,
                producerIds: producerIds,
              });
            }
          }
        }
        callback(producersData);
      });
      //

      //
      socket.on("producer-close", ({ producerId }) => {
        const peer = peers[socket.id];
        if (!peer) return;
        const { roomName } = peer;

        const producer = peer?.producers.get(producerId);
        if (!producer) return;
        if (producer.kind === "audio") {
          peer.hasAudio = false;
        } else if (producer.kind === "video") {
          peer.hasVideo = false;
        }
        producer.close();
        peers[socket.id].producers.delete(producerId);

        for (const peerId of rooms[roomName].peers) {
          if (peerId !== socket.id) {
            peers[peerId]?.socket.emit("producer-closed", {
              remoteProducerId: producerId,
            });
          }
        }
        const participantList = getParticipantListForRoom(roomName);
        connections.to(roomName).emit("room-participants", participantList);
      });
      //

      //
      socket.on(
        "consume",
        async (
          { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
          callback
        ) => {
          const { roomName } = peers[socket.id];
          const router = rooms[roomName].router;
          const transport = peers[socket.id]?.transports.get(
            serverConsumerTransportId
          );

          if (
            !transport ||
            !router.canConsume({
              producerId: remoteProducerId,
              rtpCapabilities,
            })
          ) {
            return callback({ error: "Cannot consume" });
          }

          const consumer = await transport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
          });
          peers[socket.id].consumers.set(consumer.id, consumer);

          consumer.on("producerclose", () => {
            socket.emit("producer-closed", { remoteProducerId });
          });

          callback({
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          });
        }
      );
      //

      //
      socket.on("consumer-resume", async ({ serverConsumerId }) => {
        const consumer = peers[socket.id]?.consumers.get(serverConsumerId);
        if (consumer && !consumer.closed) {
          try {
            await consumer.resume();
          } catch (error) {
            console.error("Error resuming consumer:", error);
          }
        }
      });
      //
      //  /////organizer powers/////
      socket.on("organizer:mute-peer", ({ targetPeerId }) => {
        const result = handleMutePeer(socket.id, targetPeerId);
        // Broadcast ONLY if the state was successfully changed
        if (result.success && result.roomName) {
          const participantList = getParticipantListForRoom(result.roomName);
          connections
            .to(result.roomName)
            .emit("room-participants", participantList);
        }
      });

      socket.on("organizer:stop-video-peer", ({ targetPeerId }) => {
        if (!isOrganizer(socket.id)) return;

        const result = handleStopVideoPeer(socket.id, targetPeerId);
        if (result.success && result.roomName) {
          const participantList = getParticipantListForRoom(result.roomName);
          connections
            .to(result.roomName)
            .emit("room-participants", participantList);
        }
      });

      socket.on("organizer:kick-peer", ({ targetPeerId }) => {
        if (!isOrganizer(socket.id)) return;

        const result = handleKickPeer(socket.id, targetPeerId);
        // The broadcast update is handled by the main 'disconnect' event
        if (result.success) {
          console.log(`Kick command successful for ${targetPeerId}`);
        }
      });
      //
      socket.on("organizer:mute-all", () => {
        const auth = isOrganizer(socket.id);
        if (!auth) return;

        const { mainRoom, peer } = auth; // 👇 THE FIX: Get the name from the peer, not the router ID
        const mainRoomName = peer.roomName.split("-breakout-")[0];

        console.log(`Organizer ${peer.user.name} is muting all.`);
        let someoneWasMuted = false;
        Object.values(peers).forEach((p) => {
          // 👇 This check will now work correctly
          if (
            p.roomName.startsWith(mainRoomName) &&
            p.socket.id !== socket.id
          ) {
            // Use your helper function!
            const result = handleMutePeer(socket.id, p.socket.id);
            if (result.success) {
              someoneWasMuted = true;
            }
          }
        }); // If we successfully muted anyone, broadcast the new state

        if (someoneWasMuted) {
          // Broadcast the new state to everyone
          const allRooms = [mainRoomName, ...(mainRoom.breakoutRooms ?? [])];
          allRooms.forEach((roomName) => {
            const participantList = getParticipantListForRoom(roomName);
            if (participantList.length > 0) {
              connections
                .to(roomName)
                .emit("room-participants", participantList);
            }
          });
          broadcastBreakoutState(mainRoomName);
        }
      });

      socket.on("organizer:transfer-role", ({ targetUserId }) => {
        const auth = isOrganizer(socket.id);
        if (!auth) return;

        const { mainRoom, peer } = auth;
        const mainRoomName = peer.roomName.split("-breakout-")[0];
        const targetPeer = Object.values(peers).find(
          (p) =>
            p.user.id === targetUserId && p.roomName.startsWith(mainRoomName)
        );

        if (!targetPeer || !targetPeer.roomName.startsWith(mainRoomName)) {
          console.warn("Target peer not found in the same meeting.");
          return;
        }

        console.log(`Transferring role to ${targetPeer.user.name}`);
        mainRoom.organizerId = targetPeer.user.id;
        broadcastBreakoutState(mainRoomName);
        const allRooms = [mainRoomName, ...(mainRoom.breakoutRooms ?? [])];
        allRooms.forEach((roomName) => {
          const participantList = getParticipantListForRoom(roomName);
          connections.to(roomName).emit("room-participants", participantList);
        });
      });
      //
      socket.on("peer:send-public-message", ({ text }: { text: string }) => {
        const peer = peers[socket.id];
        if (!peer) return;
        const { roomName, user } = peer;
        if (!rooms[roomName]) return;

        const message = {
          id: randomUUID(),
          senderId: user.id, // ✅ Add senderId
          senderName: user.name,
          text: text,
        };

        console.log(`Broadcasting public message to room ${roomName}`);
        connections.to(roomName).emit("room:new-public-message", message);
      });

      // ✅ Added this
      socket.on("peer:send-private-message", ({ targetUserId, text }) => {
        const senderPeer = peers[socket.id];
        if (!senderPeer) return;

        const message = {
          id: randomUUID(),
          senderId: senderPeer.user.id,
          senderName: senderPeer.user.name,
          text: text,
        };

        // Find the target peer by looping through peers and checking the user.id
        const targetPeer = Object.values(peers).find(
          (p) => p.user.id === targetUserId
        );

        if (targetPeer) {
          const targetSocketId = targetPeer.socket.id; // Get their actual socket.id

          // Send to receiver (they get the message "from" the sender)
          connections.to(targetSocketId).emit("room:new-private-message", {
            message,
          });

          // Send back to sender (we add targetUserId so they know where to store it)
          socket.emit("room:new-private-message", {
            message,
            targetUserId: targetUserId,
          });
        } else {
          console.warn(
            `Could not find target user ${targetUserId} to send private message.`
          );
        }
      });
      // ///brakout logic////

      //
      socket.on("get-room-participants", ({ roomName }, callback) => {
        const room = rooms[roomName];
        if (!room) return callback([]);
        const participantList = Array.from(room.peers).map((peerId) => ({
          id: peerId,
          name: peers[peerId]?.user.name || "Unknown",
        }));
        callback(participantList);
      });
      //
      const getParticipantListForRoom = (roomName: string) => {
        const room = rooms[roomName];
        if (!room) return [];
        const mainRoomName = roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        return Array.from(room.peers)
          .map((id) => {
            const peerData = peers[id];
            if (!peerData) return null;
            const isPeerOrganizer = peerData.user.id === mainRoom?.organizerId;
            return {
              id,
              userId: peerData.user.id,
              name: peerData.user.name,
              isOrganizer: isPeerOrganizer,
              hasAudio: peerData.hasAudio,
              hasVideo: peerData.hasVideo,
            };
          })
          .filter(Boolean);
      };
      //
      socket.on("client:ready-for-new-room", async ({ newRoomName }) => {
        const peer = peers[socket.id];
        if (!peer || !rooms[newRoomName]) {
          console.error(`Invalid peer or room: ${socket.id}, ${newRoomName}`);
          return;
        }

        const oldRoomName = peer.roomName;
        console.log(
          `SERVER: Explicitly cleaning up media objects for ${peer.user.name} before move.`
        );
        peer.transports.forEach((transport) => transport.close());
        peer.producers.forEach((producer) => producer.close());
        peer.consumers.forEach((consumer) => consumer.close());
        peer.transports.clear();
        peer.producers.clear();
        peer.consumers.clear();
        console.log(
          `SERVER: Moving peer ${peer.user.name} from ${oldRoomName} to ${newRoomName}`
        );
        if (rooms[oldRoomName]) {
          rooms[oldRoomName].peers.delete(socket.id);
          socket.leave(oldRoomName);
        }

        rooms[newRoomName].peers.add(socket.id);
        peer.roomName = newRoomName;
        socket.join(newRoomName);

        const router = rooms[newRoomName].router;
        socket.emit("server:you-are-moved", {
          newRoomName: newRoomName,
          rtpCapabilities: router.rtpCapabilities,
        });

        // const mainRoomName = oldRoomName.split("-breakout-")[0];
        // if (rooms[mainRoomName]) {
        //   broadcastBreakoutState(mainRoomName); // This sends the updated list to everyone
        // }
        const oldRoomList = getParticipantListForRoom(oldRoomName);
        connections.to(oldRoomName).emit("room-participants", oldRoomList);

        const newRoomList = getParticipantListForRoom(newRoomName);
        connections.to(newRoomName).emit("room-participants", newRoomList);
      });

      //
      socket.on(
        "organizer:createBreakoutRooms",
        async ({ roomName, numRooms }) => {
          if (!isOrganizer(socket.id)) return;
          const mainRoom = rooms[roomName];
          if (!mainRoom) {
            console.error(
              `Main room "${roomName}" not found for creating breakout rooms.`
            );
            return;
          }
          mainRoom.breakoutRooms = [];
          mainRoom.assignments = new Map();
          console.log("new assign", mainRoom.assignments);

          for (let i = 0; i < numRooms; i++) {
            const breakoutRoomName = `${roomName}-breakout-${i + 1}`;
            await createRoom(breakoutRoomName);
            // Inherit organizer from main room
            if (rooms[breakoutRoomName]) {
              rooms[breakoutRoomName].organizerId = mainRoom.organizerId;
            }
            mainRoom.breakoutRooms.push(breakoutRoomName);
          }

          broadcastBreakoutState(roomName);
        }
      );

      socket.on("organizer:assignPeerToRoom", ({ peerId, targetRoomName }) => {
        const peer = peers[socket.id];
        if (!isOrganizer(socket.id)) return;

        const mainRoomName = peer.roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];
        const peerToAssign = peers[peerId];
        if (!peerToAssign) return;
        const persistentUserId = String(peerToAssign.user.id);

        if (mainRoom?.assignments) {
          mainRoom.assignments.set(persistentUserId, targetRoomName);
          broadcastBreakoutState(mainRoomName);
          console.log("assignpeer", mainRoom.assignments);
        }
      });

      socket.on("organizer:startBreakouts", ({ mainRoomName }) => {
        const mainRoom = rooms[mainRoomName];
        if (!mainRoom || !mainRoom.assignments) return;
        if (!isOrganizer(socket.id) || !mainRoom) return;

        const findPeerByUserId = (userId: string): PeerState | undefined => {
          return Object.values(peers).find((p) => p.user.id === userId);
        };

        for (const [userId, targetRoomName] of mainRoom.assignments.entries()) {
          const peerToMove = findPeerByUserId(userId);
          if (peerToMove && peerToMove.roomName !== targetRoomName) {
            peerToMove.socket.emit("server:prepare-to-move", {
              newRoomName: targetRoomName,
            });
          }
        }
        console.log("start breakoutroom", mainRoom.assignments);
      });
      //
      socket.on("peer:exitBreakoutRoom", () => {
        const peer = peers[socket.id];
        if (!peer || !peer.roomName.includes("-breakout-")) return;

        const currentRoomName = peer.roomName;
        const mainRoomName = currentRoomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        if (!rooms[currentRoomName] || !mainRoom) {
          console.error("Could not find rooms for peer exiting breakout.");
          return;
        }

        if (mainRoom.assignments) {
          mainRoom.assignments.set(String(peer.user.id), mainRoomName);
          broadcastBreakoutState(mainRoomName);
          console.log("peerexitbrekoutroom", mainRoom.assignments);
        }

        //  Tell the client to execute the move
        if (rooms[mainRoomName]) {
          peer.socket.emit("server:prepare-to-move", {
            newRoomName: mainRoomName,
          });
        }
      });

      //
      socket.on("organizer:endBreakouts", ({ mainRoomName }) => {
        const mainRoom = rooms[mainRoomName];
        if (!isOrganizer(socket.id)) return;

        if (!mainRoom.breakoutRooms) return;
        mainRoom.breakoutRooms.forEach((breakoutRoomName) => {
          const breakoutRoom = rooms[breakoutRoomName];

          breakoutRoom?.peers.forEach((peerId) => {
            const peer = peers[peerId];

            if (peer) {
              peer.socket.emit("server:prepare-to-move", {
                newRoomName: mainRoomName,
              });
            }
          });
        });

        mainRoom.breakoutRooms = [];
        mainRoom.assignments = new Map();
        broadcastBreakoutState(mainRoomName);
        console.log("endbrekoutroom", mainRoom.assignments);
      });
      //
      socket.on("organizer:end-meeting", ({ mainRoomName }) => {
        // 1. Security Check: Is this peer an organizer?
        const auth = isOrganizer(socket.id);
        if (!auth) {
          console.warn(`Non-organizer ${socket.id} tried to end meeting.`);
          return;
        }

        // 2. Check if the main room from the request matches the organizer's room
        const organizerMainRoom = auth.peer.roomName.split("-breakout-")[0];
        if (organizerMainRoom !== mainRoomName) {
          console.warn(
            `Organizer ${socket.id} tried to end a different meeting.`
          );
          return;
        }

        console.log(
          `Organizer ${auth.peer.user.name} is ending meeting: ${mainRoomName}`
        );

        // 3. Kick every peer in that meeting (main room + all breakouts)
        Object.values(peers).forEach((peer) => {
          if (
            peer.roomName.startsWith(mainRoomName) && // Is in the same meeting
            peer.socket.id !== socket.id // DON'T kick the organizer
          ) {
            console.log(`Ending meeting: Kicking peer ${peer.user.name}`);
            // This event is already handled by your client to trigger cleanup
            peer.socket.emit("server:you-are-kicked");
          }
        });

        // 4. (Optional) Clean up the rooms from memory
        // The disconnect handler will eventually clean them, but this is faster.
        if (rooms[mainRoomName] && rooms[mainRoomName].breakoutRooms) {
          rooms[mainRoomName].breakoutRooms.forEach((brName) => {
            delete rooms[brName];
          });
        }
        delete rooms[mainRoomName];
      });
      //

      const cleanupPeer = (socketId: string) => {
        const peer = peers[socketId];
        if (!peer) return;

        console.log(
          `SERVER: Cleaning up peer ${peer.user.name} from room ${peer.roomName}. Closing ${peer.transports.size} transports.`
        );
        // Close all of this peer's producers, consumers, and transports
        peer.producers.forEach((producer) => producer.close());
        peer.consumers.forEach((consumer) => consumer.close());
        peer.transports.forEach((transport) => transport.close());

        if (peer.roomName && rooms[peer.roomName]) {
          rooms[peer.roomName].peers.delete(socketId);
        }

        delete peers[socketId];
      };
      //
    });
  } catch (error) {
    console.error("Mediasoup initialization failed:", error);
    process.exit(1);
  }
};
//
const createWebRtcTransport = async (router: Router) => {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || "127.0.0.1",
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  transport.on("dtlsstatechange", (dtlsState) => {
    if (dtlsState === "closed") transport.close();
  });

  return transport;
};
