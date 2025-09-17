import * as mediasoup from "mediasoup";
type Router = mediasoup.types.Router;
import { Socket } from "socket.io";
import { findUserById } from "./helper/findUsers";
import type { mockUser } from "./users";
let worker: mediasoup.types.Worker;
// let rooms: Record<string, Room> = {}; // { roomName1: { Router, rooms: [ soketId1, ... ] }, ...}
// let peers: Record<string, Peer> = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}

const rooms: Record<
  string,
  {
    router: Router;
    organizerId?: string; // Tracks the meeting organizer
    peers: Set<string>;
    breakoutRooms?: string[];
    assignments?: Map<string, string>;
  }
> = {};
const peers: Record<
  string,
  {
    socket: Socket;
    user: mockUser;
    roomName: string;
    transports: Map<string, mediasoup.types.Transport>;
    producers: Map<string, mediasoup.types.Producer>;
    consumers: Map<string, mediasoup.types.Consumer>;
  }
> = {};

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

    connections.on("connection", async (socket: Socket) => {
      console.log("new connectiion", socket.id);
      // connection-success
      socket.emit("connection-success", {
        socketId: socket.id,
      });
      //
      socket.on("organizer:requestBreakoutState", ({ roomName }) => {
        const mainRoom = rooms[roomName];
        if (!mainRoom) return;

        const userPeer = peers[socket.id];
        if (
          !userPeer ||
          (userPeer.user.role !== "Admin" && userPeer.user.role !== "Manager")
        ) {
          return;
        }

        socket.emit("organizer:breakoutState", {
          breakoutRooms: mainRoom.breakoutRooms || [],
          assignments: mainRoom.assignments
            ? Array.from(mainRoom.assignments.entries())
            : [],
        });
      });

      //
      socket.on("disconnect", () => {
        console.log("peer disconnected", socket.id);
        const peer = peers[socket.id];
        if (peer) {
          const roomName = peer.roomName;
          cleanupPeer(socket.id);
          peer.producers.forEach((producer) => {
            producer.close(); // This will notify all consumers
          });

          if (rooms[roomName]) {
            rooms[roomName].peers.delete(socket.id);
            // ✅ When a user disconnects, broadcast the updated list to the remaining peers
            const participantList = Array.from(rooms[roomName].peers).map(
              (id) => {
                const peer = peers[id];
                const isPeerOrganizer =
                  peer.user.role === "Admin" || peer.user.role === "Manager";
                return {
                  id,
                  userId: peer.user.id,
                  name: peer.user.name,
                  isOrganizer: isPeerOrganizer,
                };
              }
            );
            connections.to(roomName).emit("room-participants", participantList);
          }

          peer.transports.forEach((transport) => transport.close());
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
        const mainRoomName = roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        const isOrganizerRole =
          user.role === "Admin" || user.role === "Manager";

        if (isOrganizerRole) {
          const mainRoomName = roomName.split("-breakout-")[0];
          const mainRoom = rooms[mainRoomName];

          if (
            mainRoom &&
            mainRoom.breakoutRooms &&
            mainRoom.breakoutRooms.length > 0
          ) {
            socket.emit("organizer:breakoutState", {
              breakoutRooms: mainRoom.breakoutRooms,
              assignments: mainRoom.assignments
                ? Array.from(mainRoom.assignments.entries())
                : [],
            });
          }
        }

        if (
          mainRoom &&
          !mainRoom.organizerId &&
          isOrganizerRole &&
          !roomName.includes("-breakout-")
        ) {
          mainRoom.organizerId = user.id;
        }
        // ✅ THE FIX: Create the peer object FIRST.
        peers[socket.id] = {
          socket,
          roomName,
          user: user,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        };
        socket.join(roomName);

        const participantList = Array.from(rooms[roomName].peers)
          .map((id) => {
            const peer = peers[id];
            const isPeerOrganizer =
              peer.user.role === "Admin" || peer.user.role === "Manager";

            return {
              id,
              userId: peer.user.id,
              name: peer?.user.name || "Unknown",
              isOrganizer: isPeerOrganizer, // Role is checked for EVERYONE
            };
          })
          .filter(Boolean);

        connections.to(roomName).emit("room-participants", participantList);

        if (roomName !== mainRoomName) {
          const mainRoomList = Array.from(mainRoom.peers)
            .map((id) => {
              const peer = peers[id];
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
          const transport = peers[socket.id]?.transports.get(transportId);
          if (!transport) return;
          const producer = await transport.produce({ kind, rtpParameters });
          const { roomName } = peers[socket.id];
          peers[socket.id].producers.set(producer.id, producer); // Inform other peers

          for (const peerId of rooms[roomName].peers) {
            if (peerId !== socket.id) {
              peers[peerId]?.socket.emit("new-producer", {
                producerId: producer.id,
                peerId: socket.id,
              });
            }
          }
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
        const { roomName } = peers[socket.id];
        const producer = peers[socket.id]?.producers.get(producerId);
        if (!producer) return;

        producer.close();
        peers[socket.id].producers.delete(producerId);

        for (const peerId of rooms[roomName].peers) {
          if (peerId !== socket.id) {
            peers[peerId]?.socket.emit("producer-closed", {
              remoteProducerId: producerId,
            });
          }
        }
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
        try {
          const consumer = peers[socket.id]?.consumers.get(serverConsumerId);
          if (consumer && !consumer.closed) {
            await consumer.resume();
          }
        } catch (error) {
          console.error("Error resuming consumer:", error);
          // Remove the closed consumer
          peers[socket.id]?.consumers.delete(serverConsumerId);
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

      socket.on(
        "organizer:createBreakoutRooms",
        async ({ roomName, numRooms }, callback) => {
          const userPeer = peers[socket.id];

          if (
            !userPeer ||
            (userPeer.user.role !== "Admin" && userPeer.user.role !== "Manager")
          ) {
            console.warn("A non-organizer tried to perform an action.");
            return; // Stop non-organizers
          }
          const mainRoom = rooms[roomName];
          if (!mainRoom) return callback({ error: "Main room not found." });

          mainRoom.breakoutRooms = [];
          mainRoom.assignments = new Map();
          const breakoutRoomNames: string[] = [];

          for (let i = 0; i < numRooms; i++) {
            const breakoutRoomName = `${roomName}-breakout-${i + 1}`;
            await createRoom(breakoutRoomName);
            // Inherit organizer from main room
            if (rooms[breakoutRoomName]) {
              rooms[breakoutRoomName].organizerId = mainRoom.organizerId;
            }
            mainRoom.breakoutRooms.push(breakoutRoomName);
            breakoutRoomNames.push(breakoutRoomName);
          }
          const organizersInMainRoom = Array.from(mainRoom.peers).filter(
            (peerId) => {
              const peer = peers[peerId];
              return (
                peer &&
                (peer.user.role === "Admin" || peer.user.role === "Manager")
              );
            }
          );

          organizersInMainRoom.forEach((organizerId) => {
            peers[organizerId]?.socket.emit("organizer:breakoutRoomsCreated", {
              breakoutRoomNames,
              mainRoomName: roomName,
            });
          });
          callback({ breakoutRoomNames });
        }
      );

      socket.on("organizer:assignPeerToRoom", ({ peerId, targetRoomName }) => {
        const userPeer = peers[socket.id];
        const peerToAssign = peers[peerId];
        if (
          !userPeer ||
          (userPeer.user.role !== "Admin" && userPeer.user.role !== "Manager")
        ) {
          return;
        }

        if (
          peerToAssign &&
          (peerToAssign.user.role === "Admin" ||
            peerToAssign.user.role === "Manager")
        ) {
          const targetRoom = rooms[targetRoomName];
          if (targetRoom) {
            targetRoom.organizerId = peerToAssign.user.id.toString();
          }
        }
        const mainRoomName = userPeer.roomName.split("-breakout-")[0];
        const mainRoom = rooms[mainRoomName];

        if (mainRoom?.assignments) {
          mainRoom.assignments.set(peerId, targetRoomName);
          const organizersInMainRoom = Array.from(mainRoom.peers).filter(
            (peerId) => {
              const peer = peers[peerId];
              return (
                peer &&
                (peer.user.role === "Admin" || peer.user.role === "Manager")
              );
            }
          );

          organizersInMainRoom.forEach((organizerId) => {
            peers[organizerId]?.socket.emit(
              "organizer:assignmentsUpdated",
              Array.from(mainRoom.assignments.entries())
            );
          });
        }
      });

      socket.on("organizer:startBreakouts", ({ mainRoomName }) => {
        const mainRoom = rooms[mainRoomName];
        const userPeer = peers[socket.id];
        if (
          !userPeer ||
          !mainRoom ||
          userPeer.user.id !== mainRoom.organizerId
        ) {
          return;
        }
        if (!mainRoom || !mainRoom.assignments) return;
        for (const [peerId, targetRoomName] of mainRoom.assignments.entries()) {
          const peerToMove = peers[peerId];
          if (peerToMove && peerToMove.roomName !== targetRoomName) {
            cleanupPeerMediasoupObjects(peerId);
            const oldRoomName = peerToMove.roomName;
            if (rooms[oldRoomName]) rooms[oldRoomName].peers.delete(peerId);
            if (rooms[targetRoomName]) rooms[targetRoomName].peers.add(peerId);
            peerToMove.roomName = targetRoomName;

            peerToMove.socket.emit("server:forceMoveToRoom", {
              breakoutRoomName: targetRoomName,
            });
          }
        }
        // After moving, broadcast updated lists to all affected rooms
        setTimeout(() => {
          const allAffectedRooms = new Set([
            mainRoomName,
            ...(mainRoom.assignments
              ? Array.from(mainRoom.assignments.values())
              : []),
          ]);
          allAffectedRooms.forEach((rName) => {
            const room = rooms[rName];
            if (room) {
              const updatedList = Array.from(room.peers)
                .map((id) => {
                  const peer = peers[id];
                  const isPeerOrganizer =
                    peer.user.role === "Admin" || peer.user.role === "Manager";
                  return {
                    id,
                    userId: peer.user.id,
                    name: peer.user.name,
                    isOrganizer: isPeerOrganizer,
                  };
                })
                .filter(Boolean);
              connections.to(rName).emit("room-participants", updatedList);
            }
          });
        }, 1000); // Delay to allow clients to connect
      });
      //
      socket.on("peer:exitBreakoutRoom", () => {
        const peer = peers[socket.id];
        if (!peer || !peer.roomName.includes("-breakout-")) {
          // Ignore if the user isn't in a breakout room
          return;
        }
        cleanupPeerMediasoupObjects(socket.id);
        const currentRoomName = peer.roomName;
        const mainRoomName = currentRoomName.split("-breakout-")[0];
        const currentRoom = rooms[currentRoomName];
        const mainRoom = rooms[mainRoomName];

        if (!rooms[currentRoomName] || !mainRoom) {
          console.error("Could not find rooms for peer exiting breakout.");
          return;
        }
        rooms[currentRoomName].peers.delete(socket.id);
        mainRoom.peers.add(socket.id);
        peer.roomName = mainRoomName;

        //  FIX: Update the assignment map to reflect the move
        if (mainRoom.assignments) {
          mainRoom.assignments.set(socket.id, mainRoomName);

          // Notify the organizer that assignments have changed
          const organizerPeer = Object.values(peers).find(
            (p) => p.user.id === mainRoom.organizerId
          );
          if (organizerPeer) {
            organizerPeer.socket.emit(
              "organizer:assignmentsUpdated",
              Array.from(mainRoom.assignments.entries())
            );
          }
        }

        //  Tell the client to execute the move
        socket.emit("server:forceMoveToRoom", {
          breakoutRoomName: mainRoomName,
        });

        //  Broadcast updated participant lists to both rooms
        // Update the breakout room (one less participant)
        const breakoutList = Array.from(currentRoom.peers).map((id) => {
          const p = peers[id];
          const isOrg = p.user.role === "Admin" || p.user.role === "Manager";
          return {
            id,
            userId: p.user.id,
            name: p.user.name,
            isOrganizer: isOrg,
          };
        });
        connections.to(currentRoomName).emit("room-participants", breakoutList);

        // Use a small delay to allow the client to reconnect before broadcasting
        // the final list to the main room.
        setTimeout(() => {
          const mainList = Array.from(mainRoom.peers).map((id) => {
            const p = peers[id];
            const isOrg = p.user.role === "Admin" || p.user.role === "Manager";
            return {
              id,
              userId: p.user.id,
              name: p.user.name,
              isOrganizer: isOrg,
            };
          });
          connections.to(mainRoomName).emit("room-participants", mainList);
        }, 1000);
      });

      //
      socket.on("organizer:endBreakouts", ({ mainRoomName }) => {
        const userPeer = peers[socket.id];
        const mainRoom = rooms[mainRoomName];
        if (
          !userPeer ||
          !mainRoom ||
          userPeer.user.id !== mainRoom.organizerId
        ) {
          return;
        }
        if (!mainRoom || !mainRoom.breakoutRooms) return;
        mainRoom.breakoutRooms.forEach((breakoutRoomName) => {
          const breakoutRoom = rooms[breakoutRoomName];
          if (breakoutRoom) {
            breakoutRoom.peers.forEach((peerId) => {
              const peer = peers[peerId];
              if (peer) {
                cleanupPeerMediasoupObjects(peerId);
                peer.roomName = mainRoomName;
                mainRoom.peers.add(peerId);
                peer.socket.emit("server:forceMoveToRoom", {
                  breakoutRoomName: mainRoomName,
                });
              }
            });
          }
          // delete rooms[breakoutRoomName];
        });
        mainRoom.breakoutRooms = [];
        mainRoom.assignments = new Map();
        socket.emit("organizer:breakoutsEnded");
        setTimeout(() => {
          const finalList = Array.from(mainRoom.peers).map((id) => {
            const peer = peers[id];
            const isPeerOrganizer =
              peer.user.role === "Admin" || peer.user.role === "Manager";
            return {
              id,
              userId: peer.user.id,
              name: peer.user.name,
              isOrganizer: isPeerOrganizer,
            };
          });
          connections.to(mainRoomName).emit("room-participants", finalList);
        }, 1000);
      });
      //
      const cleanupPeerMediasoupObjects = (socketId: string) => {
        const peer = peers[socketId];
        if (!peer) return;

        // Close consumers first
        peer.consumers.forEach((consumer) => {
          try {
            if (!consumer.closed) consumer.close();
          } catch (error) {
            console.error("Error closing consumer:", error);
          }
        });

        // Then producers
        peer.producers.forEach((producer) => {
          try {
            if (!producer.closed) producer.close();
          } catch (error) {
            console.error("Error closing producer:", error);
          }
        });

        // Finally transports
        peer.transports.forEach((transport) => {
          try {
            if (!transport.closed) transport.close();
          } catch (error) {
            console.error("Error closing transport:", error);
          }
        });

        peer.producers.clear();
        peer.consumers.clear();
        peer.transports.clear();
      };
      //

      const cleanupPeer = (socketId: string) => {
        const peer = peers[socketId];
        if (!peer) return;

        console.log(
          `Cleaning up mediasoup objects for peer: ${peer.user.name}`
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
