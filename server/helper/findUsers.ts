import { MOCK_USERS } from "../users";

export function findUserById(participantId: string) {
 const user= MOCK_USERS.find((user) => user.id === participantId);
return user
}
