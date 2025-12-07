A video-conference application that supports multiple users using the Mediasoup SFU architecture. This project also includes features such as breakout rooms and other meeting-management functionalities.


## Getting Started

First, run the development server:

```bash
pnpm install
# to run server
pnpm dev:server
# to run client
pnpm dev:client
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
You can start editing the page by modifying `src/app/pages`.
## Login page
<img width="1919" height="918" alt="Screenshot 2025-12-07 203831" src="https://github.com/user-attachments/assets/98da3e38-ff66-4da7-b4db-3e0188936721" />

## Participant side panel
<img width="1920" height="908" alt="Screenshot (44)" src="https://github.com/user-attachments/assets/6a24b323-2f08-4e31-bf8d-60fa195c1e70" />

## Breakout Room
<img width="1920" height="914" alt="Screenshot (45)" src="https://github.com/user-attachments/assets/82d68ad5-3e5c-4155-8a8d-676e3367be21" />

## Room leaving message for organizer 
<img width="1920" height="912" alt="Screenshot (46)" src="https://github.com/user-attachments/assets/b635a46a-a0e6-45c1-9468-b55953ce6195" />

## Public and Private Chats
<img width="1919" height="908" alt="Screenshot 2025-12-07 210340" src="https://github.com/user-attachments/assets/9251ea14-9dd0-4f29-a1da-a59df413370c" />
<img width="1919" height="912" alt="Screenshot 2025-12-07 210414" src="https://github.com/user-attachments/assets/54a73fbd-b422-4645-8acb-8904af09d894" />

## Organizer Power
1) Can mute Audio and Video of other users.
2) Can Kick Out other users.
3) Make other user as organizer.
4) Can Create Breakout Rooms.   
## env file 
1) PORT= example:8000
2) MEDIASOUP_LISTEN_IP= eg:0.0.0.0
3) MEDIASOUP_ANNOUNCED_IP= your an announced ip if use server server's ip, if local your lap's ip eg :127.0.0.1
4) NEXT_PUBLIC_MEDIASOUP_CLIENT_URL=eg:http://localhost:8000
