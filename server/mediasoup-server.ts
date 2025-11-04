import * as mediasoup from "mediasoup";
type Router = mediasoup.types.Router;
import { Socket } from "socket.io";
import { findUserById } from "./helper/findUsers";
import { RoomState, PeerState } from "./helper/types";
import {
  handleKickPeer,
  handleMutePeer,
  handleStopVideoPeer,
} from "./helper/organizePower";

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
    const connections = io.of("/mediasoup");

    // Centralized function to broadcast the complete breakout room state to all organizers.
    const broadcastBreakoutState = (mainRoomName: string) => {
      const mainRoom = rooms[mainRoomName];
      if (!mainRoom) return;

      const state = {
        breakoutRoomNames: mainRoom.breakoutRooms ?? [],
        assignments: Array.from(mainRoom.assignments?.entries() ?? []),
      };

      // Find all organizers in the main room and send them the latest state.
      Array.from(mainRoom.peers)
        .map((peerId) => peers[peerId])
        .filter(
          (peer) =>
            peer && (peer.user.role === "Admin" || peer.user.role === "Manager")
        )
        .forEach((organizerPeer) => {
          organizerPeer.socket.emit("organizer:breakoutState", state);
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
        const roomName = peer.roomName;
        if (rooms[roomName]) {
          rooms[roomName].peers.delete(socket.id);
          // ✅ When a user disconnects, broadcast the updated list to the remaining peers
          const participantList = getParticipantListForRoom(roomName);
          connections.to(roomName).emit("room-participants", participantList);
        }
        if (peer) {
          cleanupPeer(socket.id);

          delete peers[socket.id];
        }
      });

      //
      const createRoom = async (roomName: string): Promise<Router> => {
        let room = rooms[roomName];

        if (!room) {
          const router = await worker.createRouter({ mediaCodecs });
          room = { router, peers: new Set() };
          rooms[roomName] = room;
        }

        return room.router;
      };
      //
      socket.on("joinRoom", async ({ roomName, participantId }, callback) => {
        let user = findUserById(participantId);
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
          // ✅ Initialize media state (assume starts enabled, adjust if needed)
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
        const isOrganizerRole =
          user.role === "Admin" || user.role === "Manager";

        if (
          mainRoom &&
          !mainRoom.organizerId &&
          isOrganizerRole &&
          !roomName.includes("-breakout-")
        ) {
          mainRoom.organizerId = user.id;
        }

        if (
          isOrganizerRole &&
          mainRoom.breakoutRooms &&
          mainRoom.breakoutRooms.length > 0
        ) {
          socket.emit("organizer:breakoutState", {
            breakoutRoomNames: mainRoom.breakoutRooms,
            assignments: Array.from(mainRoom.assignments?.entries() ?? []),
          });
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
              const isPeerOrganizer =
                peer.user.role === "Admin" || peer.user.role === "Manager";
              return {
                id,
                userId: peer.user.id,
                name: peers[id]?.user.name,
                isOrganizer: isPeerOrganizer,
              };
            })
            .filter(Boolean);
          connections.to(mainRoomName).emit("room-participants", mainRoomList);
        }

        callback({ rtpCapabilities: router.rtpCapabilities });
      });
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
          console.log(participantList);
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
        const organizer = peers[socket.id];
        if (
          !organizer ||
          (organizer.user.role !== "Admin" && organizer.user.role !== "Manager")
        ) {
          console.warn("Non-organizer attempted to stop video.");
          return;
        }

        const result = handleStopVideoPeer(socket.id, targetPeerId);
        if (result.success && result.roomName) {
          const participantList = getParticipantListForRoom(result.roomName);
          connections
            .to(result.roomName)
            .emit("room-participants", participantList);
        }
      });

      socket.on("organizer:kick-peer", ({ targetPeerId }) => {
        const organizer = peers[socket.id];
        if (
          !organizer ||
          (organizer.user.role !== "Admin" && organizer.user.role !== "Manager")
        ) {
          console.warn("Non-organizer attempted to kick peer.");
          return;
        }

        const result = handleKickPeer(socket.id, targetPeerId);
        // The broadcast update is handled by the main 'disconnect' event
        if (result.success) {
          console.log(`Kick command successful for ${targetPeerId}`);
        }
      });
      //

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
        return Array.from(room.peers)
          .map((id) => {
            const peerData = peers[id];
            if (!peerData) return null;
            const isPeerOrganizer =
              peerData.user.role === "Admin" ||
              peerData.user.role === "Manager";
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

        const oldRoomList = getParticipantListForRoom(oldRoomName);
        connections.to(oldRoomName).emit("room-participants", oldRoomList);

        const newRoomList = getParticipantListForRoom(newRoomName);
        connections.to(newRoomName).emit("room-participants", newRoomList);
      });

      //
      socket.on(
        "organizer:createBreakoutRooms",
        async ({ roomName, numRooms }) => {
          const userPeer = peers[socket.id];

          if (
            !userPeer ||
            (userPeer.user.role !== "Admin" && userPeer.user.role !== "Manager")
          ) {
            console.warn("A non-organizer tried to perform an action.");
            return; // Stop non-organizers
          }
          const mainRoom = rooms[roomName];
          if (!mainRoom) {
            console.error(
              `Main room "${roomName}" not found for creating breakout rooms.`
            );
            return;
          }
          mainRoom.breakoutRooms = [];
          mainRoom.assignments = new Map();

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
        const organizer = peers[socket.id];
        // const peerToAssign = peers[peerId];
        if (
          !organizer ||
          (organizer.user.role !== "Admin" && organizer.user.role !== "Manager")
        ) {
          return;
        }

        const mainRoomName = organizer.roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        if (mainRoom?.assignments) {
          mainRoom.assignments.set(peerId, targetRoomName);
          broadcastBreakoutState(mainRoomName);
        }
      });

      socket.on("organizer:startBreakouts", ({ mainRoomName }) => {
        const mainRoom = rooms[mainRoomName];
        if (!mainRoom || !mainRoom.assignments) return;
        const userPeer = peers[socket.id];
        const isOrganizer =
          userPeer &&
          (userPeer.user.role === "Admin" || userPeer.user.role === "Manager");
        if (!isOrganizer || !mainRoom) {
          return;
        }
        if (!mainRoom.assignments) return;

        for (const [peerId, targetRoomName] of mainRoom.assignments.entries()) {
          const peerToMove = peers[peerId];
          if (peerToMove && peerToMove.roomName !== targetRoomName) {
            peerToMove.socket.emit("server:prepare-to-move", {
              newRoomName: targetRoomName,
            });
          }
        }
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
          mainRoom.assignments.set(socket.id, mainRoomName);
          broadcastBreakoutState(mainRoomName);
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
        const userPeer = peers[socket.id];
        const isOrganizer =
          userPeer &&
          (userPeer.user.role === "Admin" || userPeer.user.role === "Manager");

        if (!isOrganizer || !mainRoom) {
          return;
        }

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
      });
      //
     
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
