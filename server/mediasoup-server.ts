import * as mediasoup from "mediasoup";
type Router = mediasoup.types.Router;
import { Socket } from "socket.io";
let worker: mediasoup.types.Worker;
// let rooms: Record<string, Room> = {}; // { roomName1: { Router, rooms: [ soketId1, ... ] }, ...}
// let peers: Record<string, Peer> = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
const rooms: Record<string, { router: Router; peers: Set<string> }> = {};
const peers: Record<
  string,
  {
    socket: Socket;
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
      socket.on("disconnect", () => {
        console.log("peer disconnected", socket.id);
        const peer = peers[socket.id];
        if (peer) {
          const { roomName } = peer;
          rooms[roomName]?.peers.delete(socket.id);
          peer.transports.forEach((transport) => transport.close());
          delete peers[socket.id];
        }
        // ///////
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
      socket.on("joinRoom", async ({ roomName }, callback) => {
        const router = await createRoom(roomName);
        rooms[roomName].peers.add(socket.id);
        peers[socket.id] = {
          socket,
          roomName,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
        };
        callback({ rtpCapabilities: router.rtpCapabilities });
      });
      //

      socket.on("createWebRtcTransport", async ( {},callback) => {
        const { roomName } = peers[socket.id];
        const router = rooms[roomName].router;
        const transport = await createWebRtcTransport(router);
        peers[socket.id].transports.set(transport.id, transport);
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
              });
            }
          }
          callback({ id: producer.id });
        }
      );
      //
      socket.on("getProducers", (callback) => {
        const { roomName } = peers[socket.id];
        const producerList: string[] = [];
        for (const peerId of rooms[roomName].peers) {
          if (peerId !== socket.id) {
            const peer = peers[peerId];
            peer?.producers.forEach((producer) =>
              producerList.push(producer.id)
            );
          }
        }
        callback(producerList);
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
        const consumer = peers[socket.id]?.consumers.get(serverConsumerId);
        await consumer?.resume();
      });
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
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP ||"127.0.0.1",
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
