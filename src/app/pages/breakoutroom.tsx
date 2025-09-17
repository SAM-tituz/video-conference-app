// components/BreakoutRoomsPanel.tsx
'use client';

import React, { useState, useEffect } from 'react';

export const BreakoutRoomsPanel = ({ socket, roomName }) => {
    const [numRooms, setNumRooms] = useState(2);
    const [participants, setParticipants] = useState([]);
    const [breakoutRooms, setBreakoutRooms] = useState([]);
    const [assignments, setAssignments] = useState({});

    useEffect(() => {
        if (!socket) return;
        
        // Fetch the initial list of participants
        socket.emit('get-room-participants', { roomName }, (participantList) => {
            setParticipants(participantList.filter(p => p.id !== socket.id)); // Exclude self
        });

        // Listen for updates when rooms are created
        socket.on('breakout-rooms-created', ({ breakoutRoomNames }) => {
            setBreakoutRooms(breakoutRoomNames);
        });

        // Clean up listener
        return () => {
            socket.off('breakout-rooms-created');
        };
    }, [socket, roomName]);

    const handleCreateRooms = () => {
        socket.emit('organizer:create-breakout-rooms', { numRooms });
    };

    const handleAssign = (peerId, targetRoomName) => {
        socket.emit('organizer:move-peer', { peerId, targetRoomName });
        setAssignments(prev => ({ ...prev, [peerId]: targetRoomName }));
    };

    // ✅ NEW: Function for the organizer to move themselves
    const handleOrganizerMove = (targetRoomName) => {
        // We reuse the same event, just with the organizer's own socket ID
        socket.emit('organizer:move-peer', { peerId: socket.id, targetRoomName });
    };

    return (
        <div className="absolute top-4 right-4 bg-slate-800 text-white p-4 rounded-lg shadow-xl w-80 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">Breakout Rooms</h3>
            {/* ... (Create rooms input and button) ... */}

            {breakoutRooms.length > 0 && (
                <div className="space-y-4 mt-4">
                    <div>
                        <h4 className="font-semibold mb-2">Organizer Controls</h4>
                        <div className="flex justify-between items-center p-2 bg-slate-700 rounded">
                            <span>Main Meeting</span>
                            <button onClick={() => handleOrganizerMove(roomName)} className="bg-green-600 hover:bg-green-700 px-3 py-1 text-sm rounded">Join</button>
                        </div>
                        {breakoutRooms.map(brName => (
                             <div key={brName} className="flex justify-between items-center p-2 bg-slate-700 rounded mt-1">
                                <span>{`Room ${brName.split('-').pop()}`}</span>
                                <button onClick={() => handleOrganizerMove(brName)} className="bg-green-600 hover:bg-green-700 px-3 py-1 text-sm rounded">Join</button>
                            </div>
                        ))}
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2">Assign Participants</h4>
                        {participants.map(p => (
                            <div key={p.id} className="flex justify-between items-center mt-1">
                                <span>{p.name}</span>
                                <select 
                                    value={assignments[p.id] || roomName} 
                                    onChange={(e) => handleAssign(p.id, e.target.value)}
                                    className="bg-slate-600 rounded p-1 text-sm"
                                >
                                    <option value={roomName}>Main Meeting</option>
                                    {breakoutRooms.map(brName => (
                                        <option key={brName} value={brName}>{`Room ${brName.split('-').pop()}`}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};