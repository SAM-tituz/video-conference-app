import * as mediasoup from "mediasoup";
type Router = mediasoup.types.Router;
type Transport = mediasoup.types.Transport;
type Producer = mediasoup.types.Producer;
type Consumer = mediasoup.types.Consumer;
type WebRtcTransport = mediasoup.types.WebRtcTransport;
import { Socket } from "socket.io";
// Interfaces
interface Room {
  router: Router;
  peers: string[];
}

interface Peer {
  roomName: string;
  socket: Socket;
  transports: string[];
  producers: string[];
  consumers: string[];
  peerDetails: {
    name: string;
    isAdmin: boolean;
  };
}

interface TransportItem {
  socketId: string;
  roomName: string;
  transport: Transport;
  consumer: any;
}

interface ProducerItem {
  socketId: string;
  roomName: string;
  producer: Producer;
}

interface ConsumerItem {
  socketId: string;
  roomName: string;
  consumer: Consumer;
}
let worker: mediasoup.types.Worker | null = null;
let rooms: Record<string, Room> = {}; // { roomName1: { Router, rooms: [ soketId1, ... ] }, ...}
let peers: Record<string, Peer> = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports: TransportItem[] = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers: ProducerItem[] = []; // [ { socketId1, roomName1, producer, }, ... ]
let consumers: ConsumerItem[] = []; // [ { socketId1, roomName1, consumer, }, ... ]

const createWorker = async () => {
  try {
    worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 40000,//2000
      rtcMaxPort: 49999,//2025
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

      socket.emit("connection-success", {
        socketId: socket.id,
      });
      const removeItems = <
        T extends TransportItem | ProducerItem | ConsumerItem
      >(
        items: T[],
        socketId: string,
        type: "transport" | "producer" | "consumer"
      ): T[] => {
        items.forEach((item) => {
          if (item.socketId === socket.id) {
            if (type === "transport" && "transport" in item) {
              item.transport.close();
            } else if (type === "producer" && "producer" in item) {
              item.producer.close();
            } else if (type === "consumer" && "consumer" in item) {
              item.consumer.close();
            }
          }
        });
        items = items.filter((item) => item.socketId !== socket.id);

        return items;
      };
      socket.on("disconnect", () => {
        // do some cleanup
        console.log("peer disconnected", socket.id);
        consumers = removeItems(consumers, socket.id, "consumer");
        producers = removeItems(producers, socket.id, "producer");
        transports = removeItems(transports, socket.id, "transport");

        const { roomName } = peers[socket.id];
        delete peers[socket.id];

        // remove socket from room
        rooms[roomName] = {
          router: rooms[roomName].router,
          peers: rooms[roomName].peers.filter(
            (socketId) => socketId !== socket.id
          ),
        };
      });
      //
      socket.on("joinRoom", async ({ roomName }, callback) => {
        // create Router if it does not exist
        // const router1 = rooms[roomName] && rooms[roomName].get('data').router || await createRoom(roomName, socket.id)
        const router1 = await createRoom(roomName, socket.id);

        peers[socket.id] = {
          socket,
          roomName, // Name for the Router this Peer joined
          transports: [],
          producers: [],
          consumers: [],
          peerDetails: {
            name: "",
            isAdmin: false, // Is this Peer the Admin?
          },
        };
        // console.log(peers);

        // get Router RTP Capabilities
        const rtpCapabilities = router1.rtpCapabilities;

        // call callback from the client and send back the rtpCapabilities
        callback({ rtpCapabilities });
      });
      //
      const createRoom = async (
        roomName: string,
        socketId: string
      ): Promise<Router> => {
        // worker.createRouter(options)
        // options = { mediaCodecs, appData }
        // mediaCodecs -> defined above
        // appData -> custom application data - we are not supplying any
        // none of the two are required
        let router1: Router;
        let peers: string[] = [];
        if (rooms[roomName]) {
          router1 = rooms[roomName].router;
          rooms[roomName].peers.push(socketId);
          //  console.log(peers);
        } else {
          if (!worker) {
            throw new Error("Mediasoup worker is not initialized");
          }
          router1 = await worker.createRouter({ mediaCodecs });
        }

        console.log(`Router ID: ${router1.id}`, peers.length);

        rooms[roomName] = {
          router: router1,
          peers: [...peers, socketId],
        };

        return router1;
      };
      //
      socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
        // get Room Name from Peer's properties
        const roomName = peers[socket.id].roomName;
        // get Router (Room) object this peer is in based on RoomName
        const router = rooms[roomName].router;
        createWebRtcTransport(router).then(
          (transport: any) => {
            callback({
              params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
              },
            });

            // add transport to Peer's properties
            addTransport(transport, roomName, consumer);
          },
          (error) => {
            console.log(error);
          }
        );
      });

      //\\\\\
      //
      const addTransport = (
        transport: Transport,
        roomName: string,
        consumer: boolean
      ) => {
        transports = [
          ...transports,
          { socketId: socket.id, transport, roomName, consumer },
        ];

        peers[socket.id] = {
          ...peers[socket.id],
          transports: [...peers[socket.id].transports, transport.id],
        };
      };
      //
      const getTransport = (socketId: string) => {
        const [producerTransport] = transports.filter(
          (transport) => transport.socketId === socketId && !transport.consumer
        );
        return producerTransport.transport;
      };
      //
      const addConsumer = (consumer:Consumer, roomName:string) => {
        // add the consumer to the consumers list
        consumers = [...consumers, { socketId: socket.id, consumer, roomName }];

        // add the consumer id to the peers list
        peers[socket.id] = {
          ...peers[socket.id],
          consumers: [...peers[socket.id].consumers, consumer.id],
        };
      };
      //
      const addProducer = (producer: Producer, roomName: string) => {
        producers = [...producers, { socketId: socket.id, producer, roomName }];

        peers[socket.id] = {
          ...peers[socket.id],
          producers: [...peers[socket.id].producers, producer.id],
        };
      };
      //
      const informConsumers = (
        roomName: string,
        socketId: string,
        id: string
      ) => {
        console.log(`just joined, id ${id} ${roomName}, ${socketId}`);
        // A new producer just joined
        // let all consumers to consume this producer
        producers.forEach((producerData) => {
          if (
            producerData.socketId !== socketId &&
            producerData.roomName === roomName
          ) {
            const producerSocket = peers[producerData.socketId].socket;
            // use socket to send producer id to producer
            producerSocket.emit("new-producer", { producerId: id });
          }
        });
      };
      //
      // see client's socket.emit('transport-connect', ...)
      socket.on("transport-connect", ({ dtlsParameters }) => {
        console.log("DTLS PARAMS... trranport connect ", { dtlsParameters });

        getTransport(socket.id).connect({ dtlsParameters });
      });
      //
      // see client's socket.emit('transport-produce', ...)
      socket.on(
        "transport-produce",
        async ({ kind, rtpParameters, appData }, callback) => {
          // call produce based on the prameters from the client
          const producer = await getTransport(socket.id).produce({
            kind,
            rtpParameters,
          });

          // add producer to the producers array
          const { roomName } = peers[socket.id];

          addProducer(producer, roomName);

          informConsumers(roomName, socket.id, producer.id);

          console.log("Producer ID: ", producer.id, producer.kind);

          producer.on("transportclose", () => {
            console.log("transport for this producer closed ");
            producer.close();
          });

          // Send back to the client the Producer's id
          callback({
            id: producer.id,
            producersExist: producers.length > 1 ? true : false,
          });
        }
      );
      //
      socket.on("getProducers", (callback) => {
        //return all producer transports
        const { roomName } = peers[socket.id];

        let producerList: any[] = [];
        producers.forEach((producerData) => {
          if (
            producerData.socketId !== socket.id &&
            producerData.roomName === roomName
          ) {
            producerList = [...producerList, producerData.producer.id];
          }
        });

        // return the producer list back to the client
        callback(producerList);
      });
      //
      // see client's socket.emit('transport-recv-connect', ...)
      socket.on(
        "transport-recv-connect",
        async ({ dtlsParameters, serverConsumerTransportId }) => {
          console.log(`DTLS PARAMS: ${dtlsParameters}`);
          const consumerTransportData = transports.find(
            (transportData) =>
              transportData.consumer &&
              transportData.transport.id == serverConsumerTransportId
          );
          if (consumerTransportData && consumerTransportData.transport) {
            await consumerTransportData.transport.connect({ dtlsParameters });
          } else {
            console.error(
              "Consumer transport not found for id:",
              serverConsumerTransportId
            );
          }
        }
      );
      //
      socket.on(
        "consume",
        async (
          { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
          callback
        ) => {
          try {
            const { roomName } = peers[socket.id];
            const router = rooms[roomName].router;
            const consumerTransportData = transports.find(
              (transportData) =>
                transportData.consumer &&
                transportData.transport.id == serverConsumerTransportId
            );
            if (!consumerTransportData) {
              console.log("no transport data");
              return;
            }
            let consumerTransport = consumerTransportData.transport;

            // check if the router can consume the specified producer
            if (
              router.canConsume({
                producerId: remoteProducerId,
                rtpCapabilities,
              })
            ) {
              // transport can now consume and return a consumer
              const consumer = await consumerTransport.consume({
                producerId: remoteProducerId,
                rtpCapabilities,
                paused: true,
              });

              consumer.on("transportclose", () => {
                console.log("transport close from consumer");
              });

              consumer.on("producerclose", () => {
                console.log("producer of consumer closed");
                socket.emit("producer-closed", { remoteProducerId });

                consumerTransport.close();
                transports = transports.filter(
                  (transportData) =>
                    transportData.transport.id !== consumerTransport.id
                );
                consumer.close();
                consumers = consumers.filter(
                  (consumerData) => consumerData.consumer.id !== consumer.id
                );
              });

              addConsumer(consumer, roomName);

              // from the consumer extract the following params
              // to send back to the Client
              const params = {
                id: consumer.id,
                producerId: remoteProducerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                serverConsumerId: consumer.id,
              };

              // send the parameters to the client
              callback({ params });
            }
          } catch (error) {
            if (error instanceof Error) {
              console.log(error.message);
            } else {
              console.log(String(error));
            }
            callback({
              params: {
                error: error,
              },
            });
          }
        }
      );
      //
      socket.on("consumer-resume", async ({ serverConsumerId }) => {
        console.log("consumer resume");
        const { consumer }:any = consumers.find(
          (consumerData) => consumerData.consumer.id === serverConsumerId
        );
        await consumer.resume();
      });
      //
    });
  } catch (error) {
    console.error("Mediasoup initialization failed:", error);
    process.exit(1);
  }
};
const createWebRtcTransport = async (router: Router) => {
  return new Promise(async (resolve, reject) => {
    try {
      // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "0.0.0.0", // replace with relevant IP address
            announcedIp: "127.0.0.1",
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };

      // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
      let transport = await router.createWebRtcTransport(
        webRtcTransport_options
      );
      console.log(`transport id: ${transport.id}`);

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      transport.on("@close", () => {
        console.log("transport closed");
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};
