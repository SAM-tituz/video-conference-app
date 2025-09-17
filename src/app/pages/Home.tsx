'use client';

import { useState ,useEffect} from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/provider/authprovider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const generateRoomName = () => {
  const segment = () =>
    Array.from({ length: 4 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join('');
  return `${segment()}-${segment()}-${segment()}`;
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
useEffect(() => {
    if (!user) {
      // If no user is logged in, redirect to the login page
      router.push('/login');
      return;
    }
  }, [user, router]);

  const handleJoinRoom = () => {
    if (roomName.trim() ) {
      router.push(`/meeting/${roomName}`);
    }
  };

  const handleCreateRoom = () => {
    const newRoomName = generateRoomName();
    router.push(`/meeting/${newRoomName}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="material-icons text-white text-xl">cam</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Video Meet</h1>
          </div>
          <p className="text-gray-600">Start or join a video conference</p>
        </div>

        <Card className="google-shadow">
          <CardHeader>
            <CardTitle className="text-center">Join a meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your name: {user?.name}
              </label>
            
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your role: {user?.role}
              </label>
            
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter Room Name to join the meeting
              </label>
              <Input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name"
                className="w-full"
              />
              
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleJoinRoom}
                disabled={ !roomName.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600"
              >
                <span className="material-icons mr-2">login</span>
                Join Room
              </Button>

              <Button
                onClick={handleCreateRoom}
                variant="outline"
                className="w-full"
              >
                <span className="material-icons mr-2">add</span>
                Create New Room
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500 mt-4">
                By proceeding, you agree to our terms of service and privacy policy
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
