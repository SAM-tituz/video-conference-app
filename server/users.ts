// In your server file or a shared data file (e.g., /data/users.ts)

export const MOCK_USERS = [
  {
    id: "001",
    name: "Sam",
 
    // email: "sam@example.com",
    email: "sam",
    password: "password", // For demo purposes only
  },
  {
    id: "002",
    name: "Sundar",
   
    // email: "sundar@example.com",
    email: "sundar",
    password: "password",
  },
  {
    id: "003",
    name: "Joy",

    // email: "joy@example.com",
    email: "joy",
    password: "password",
  },
  {
    id: "004",
    name: "Jem",
  
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
