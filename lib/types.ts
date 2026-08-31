export type Bar = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

export type FriendFeedRow = {
  friend_id: string;
  display_name: string;
  avatar_url: string | null;
  bar_id: string | null;
  bar_name: string | null;
  bar_city: string | null;
  bar_state: string | null;
  bar_lat: number | null;
  bar_lng: number | null;
  arrived_at: string | null;
};

export type DrinkPost = {
  id: string;
  user_id: string;
  bar_id: string | null;
  bar_name: string;
  beer_name: string;
  description: string | null;
  rating: number;
  image_path: string;
  created_at: string;
};

export type DrinkPostDraft = {
  barId: string | null;
  barName: string;
  beerName: string;
  description: string;
  rating: number;
};

export type FriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
};

export type UserStatus = {
  user_id: string;
  bar_id: string | null;
  arrived_at: string | null;
  updated_at: string;
};

export type InviteResult =
  | { kind: 'invite'; token: string; email: string }
  | { kind: 'friendship'; status: FriendRequest['status']; friendship_id: string };
