export interface Message {
  id: number;
  room_id: number;
  body: string;
  created_at: string | null;
  user: {
    id: number;
    name: string;
    email: string;
  };
}
