// In your server file or a shared data file (e.g., /data/users.ts)

export const MOCK_USERS = [
  {
    id: "user-001",
    name: "Sam",
    role: "Admin",
    // email: "sam@example.com",
    email: "sam",
    password: "password", // For demo purposes only
  },
  {
    id: "user-002",
    name: "Sundar",
    role: "Manager",
    // email: "sundar@example.com",
    email: "sundar",
    password: "password",
  },
  {
    id: "user-003",
    name: "Joy",
    role: "L2",
    // email: "joy@example.com",
    email: "joy",
    password: "password",
  },
  {
    id: "user-004",
    name: "Jem",
    role: "L2",
    // email: "jem@example.com",
    email: "jem",
    password: "password",
  },
];

export  type mockUser = {
  id: String,
  name: String,
  role: String,
  email: String,
  password?: String,
};
